import { unstable_noStore as noStore } from "next/cache";
import { isPlannedCampaign, isRecentFinishedCampaign, isSalesWindowOpen } from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { DuelParticipantMode, ProfileSummary } from "@/lib/types";

type ApprovedProfileRecord = {
  id: string;
  full_name: string;
  role: string;
  store_id: string | null;
  approval?: string;
  is_on_leave: boolean;
};

type ActiveStoreRecord = {
  id: string;
  name: string;
  is_active?: boolean;
};

type DuelRecord = {
  id: string;
  name: string;
  description: string | null;
  scoring: "points" | "quantity";
  start_at: string;
  end_at: string;
  is_active: boolean;
};

type DuelProductRecord = {
  id: string;
  duel_id: string;
  name: string;
  unit_label: string;
  base_points: number;
  sort_order: number;
};

type DuelParticipantRecord = {
  id: string;
  duel_id: string;
  matchup_no: number;
  label: string;
  participant_mode: DuelParticipantMode;
  profile_id: string | null;
  sort_order: number;
  winner_description: string | null;
  loser_description: string | null;
  profile: {
    full_name: string;
  } | null;
};

type DuelParticipantMemberRecord = {
  id: string;
  duel_participant_id: string;
  profile_id: string;
  profile: {
    full_name: string;
    store_id: string | null;
    role: string;
  } | null;
};

type DuelEntryRecord = {
  id: string;
  duel_id: string;
  participant_id: string;
  product_id: string;
  actor_profile_id: string;
  quantity: number;
  raw_score: number;
  weighted_score: number;
  created_at: string;
};

type DuelParticipantView = {
  id: string;
  matchupNo: number;
  label: string;
  participantMode: DuelParticipantMode;
  score: number;
  memberLabels: string[];
  isViewerParticipant: boolean;
  winnerDescription: string | null;
  loserDescription: string | null;
  currentResult: "winning" | "losing" | "draw";
  currentDescription: string | null;
};

type DuelMatchupView = {
  matchupNo: number;
  participants: DuelParticipantView[];
};

type DuelCard = {
  id: string;
  name: string;
  description: string | null;
  scoring: "points" | "quantity";
  start_at: string;
  end_at: string;
  is_active: boolean;
  can_submit: boolean;
  default_participant_id: string | null;
  products: DuelProductRecord[];
  participants: DuelParticipantView[];
  matchups: DuelMatchupView[];
  leaderboard: DuelParticipantView[];
  productMatrix: Array<{
    id: string;
    name: string;
    participantCells: number[];
    total: number;
  }>;
};

export type DuelDashboardData = {
  profile: ProfileSummary & { store_id?: string | null };
  activeDuels: DuelCard[];
  finishedDuels: DuelCard[];
  plannedDuels: DuelCard[];
};

function buildDuelCard(input: {
  duel: DuelRecord;
  viewerProfileId: string;
  viewerRole: string;
  products: DuelProductRecord[];
  participants: DuelParticipantRecord[];
  participantMembers: DuelParticipantMemberRecord[];
  entries: DuelEntryRecord[];
  permissionProfileIds: string[];
}): DuelCard | null {
  const scoreMap = new Map<string, number>();
  const productTotalsByParticipant = new Map<string, Map<string, number>>();

  input.entries.forEach((entry) => {
    scoreMap.set(
      entry.participant_id,
      Number(scoreMap.get(entry.participant_id) ?? 0) + Number(entry.weighted_score ?? 0)
    );

    const productMap = productTotalsByParticipant.get(entry.participant_id) ?? new Map<string, number>();
    productMap.set(
      entry.product_id,
      Number(productMap.get(entry.product_id) ?? 0) + Number(entry.quantity ?? 0)
    );
    productTotalsByParticipant.set(entry.participant_id, productMap);
  });

  const participantViews: DuelParticipantView[] = input.participants.map((participant) => {
    const memberLabels = input.participantMembers
      .filter((member) => member.duel_participant_id === participant.id)
      .map((member) => member.profile?.full_name ?? "Uye");
    const isViewerParticipant =
      participant.profile_id === input.viewerProfileId ||
      input.participantMembers.some(
        (member) =>
          member.duel_participant_id === participant.id && member.profile_id === input.viewerProfileId
      );

    return {
      id: participant.id,
      matchupNo: participant.matchup_no,
      label: participant.label,
      participantMode: participant.participant_mode,
      score: Number(scoreMap.get(participant.id) ?? 0),
      memberLabels,
      isViewerParticipant,
      winnerDescription: participant.winner_description,
      loserDescription: participant.loser_description,
      currentResult: "draw",
      currentDescription: null
    };
  });

  participantViews.forEach((participant) => {
    const opponentScores = participantViews
      .filter(
        (candidate) =>
          candidate.matchupNo === participant.matchupNo && candidate.id !== participant.id
      )
      .map((candidate) => candidate.score);
    const opponentScore = opponentScores.length ? Math.max(...opponentScores) : participant.score;

    if (participant.score > opponentScore) {
      participant.currentResult = "winning";
      participant.currentDescription = participant.winnerDescription;
    } else if (participant.score < opponentScore) {
      participant.currentResult = "losing";
      participant.currentDescription = participant.loserDescription;
    }
  });

  const canSubmit =
    input.permissionProfileIds.length === 0 || input.permissionProfileIds.includes(input.viewerProfileId);
  const canView =
    input.viewerRole !== "employee" ||
    canSubmit ||
    participantViews.some((participant) => participant.isViewerParticipant);

  if (!canView) {
    return null;
  }

  const leaderboard = [...participantViews].sort((a, b) => b.score - a.score);
  const matchups = Array.from(
    participantViews.reduce((map, participant) => {
      const currentRows = map.get(participant.matchupNo) ?? [];
      currentRows.push(participant);
      map.set(participant.matchupNo, currentRows);
      return map;
    }, new Map<number, DuelParticipantView[]>())
  )
    .sort((a, b) => a[0] - b[0])
    .map(([matchupNo, participants]) => ({
      matchupNo,
      participants: participants.slice().sort((a, b) => a.id.localeCompare(b.id))
    }));
  const defaultParticipantId =
    participantViews.find((participant) => participant.isViewerParticipant)?.id ??
    participantViews[0]?.id ??
    null;
  const matrixColumns = participantViews.map((participant) => ({
    id: participant.id,
    label: participant.label
  }));
  const productMatrix = input.products.map((product) => {
    const participantCells = matrixColumns.map((participant) =>
      Number(productTotalsByParticipant.get(participant.id)?.get(product.id) ?? 0)
    );

    return {
      id: product.id,
      name: product.name,
      participantCells,
      total: participantCells.reduce((sum, value) => sum + value, 0)
    };
  });

  return {
    ...input.duel,
    can_submit: canSubmit,
    default_participant_id: defaultParticipantId,
    products: input.products,
    participants: participantViews,
    matchups,
    leaderboard,
    productMatrix
  };
}

export async function getDuelDashboardData(userId: string): Promise<DuelDashboardData | null> {
  noStore();
  const admin = createAdminClient();
  const [{ data: profileData }, { data: duels }, { data: approvedProfiles }, { data: activeStores }] =
    await Promise.all([
      admin
        .from("profiles")
        .select(
          `
            id,
            full_name,
            email,
            phone,
            role,
            approval,
            is_on_leave,
            store_id,
            store:stores(name)
          `
        )
        .eq("id", userId)
        .single(),
      admin
        .from("duels")
        .select("id, name, description, scoring, start_at, end_at, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      admin
        .from("profiles")
        .select("id, full_name, role, store_id, approval, is_on_leave")
        .eq("approval", "approved"),
      admin.from("stores").select("id, name, is_active").eq("is_active", true)
    ]);

  const profile = (profileData as (ProfileSummary & { store_id?: string | null }) | null) ?? null;
  if (!profile) {
    return null;
  }

  const duelRows = ((duels as DuelRecord[] | null) ?? []).filter(
    (item) =>
      item.is_active &&
      (isPlannedCampaign(item.start_at) ||
        isSalesWindowOpen(item.start_at, item.end_at) ||
        isRecentFinishedCampaign(item.end_at))
  );

  const duelIds = duelRows.map((duel) => duel.id);
  const duelParticipantIds = duelIds.length
    ? (
        ((await admin.from("duel_participants").select("id").in("duel_id", duelIds)).data as
          | Array<{ id: string }>
          | null) ?? []
      ).map((row) => row.id)
    : [];

  const [
    { data: products },
    { data: participants },
    { data: participantMembers },
    { data: entries },
    { data: permissions }
  ] = duelIds.length
    ? await Promise.all([
        admin
          .from("duel_products")
          .select("id, duel_id, name, unit_label, base_points, sort_order")
          .in("duel_id", duelIds)
          .order("sort_order"),
        admin
          .from("duel_participants")
          .select(
            `
              id,
              duel_id,
              matchup_no,
              label,
              participant_mode,
              profile_id,
              sort_order,
              winner_description,
              loser_description,
              profile:profiles(full_name)
            `
          )
          .in("duel_id", duelIds)
          .order("matchup_no")
          .order("sort_order"),
        duelParticipantIds.length
          ? admin
              .from("duel_participant_members")
              .select(
                `
                  id,
                  duel_participant_id,
                  profile_id,
                  profile:profiles(full_name, store_id, role)
                `
              )
              .in("duel_participant_id", duelParticipantIds)
          : Promise.resolve({ data: [] as DuelParticipantMemberRecord[] }),
        admin
          .from("duel_entries")
          .select("id, duel_id, participant_id, product_id, actor_profile_id, quantity, raw_score, weighted_score, created_at")
          .in("duel_id", duelIds),
        admin
          .from("duel_entry_permissions")
          .select("duel_id, profile_id")
          .in("duel_id", duelIds)
      ])
    : [
        { data: [] as DuelProductRecord[] },
        { data: [] as DuelParticipantRecord[] },
        { data: [] as DuelParticipantMemberRecord[] },
        { data: [] as DuelEntryRecord[] },
        { data: [] as Array<{ duel_id: string; profile_id: string }> }
      ];

  const _approvedPeople = (approvedProfiles as ApprovedProfileRecord[] | null) ?? [];
  const _storeRows = (activeStores as ActiveStoreRecord[] | null) ?? [];

  const cards = duelRows
    .map((duel) =>
      buildDuelCard({
        duel,
        viewerProfileId: profile.id,
        viewerRole: profile.role,
        products: ((products as DuelProductRecord[] | null) ?? []).filter((product) => product.duel_id === duel.id),
        participants: ((participants as DuelParticipantRecord[] | null) ?? []).filter(
          (participant) => participant.duel_id === duel.id
        ),
        participantMembers: ((participantMembers as DuelParticipantMemberRecord[] | null) ?? []).filter((member) =>
          ((participants as DuelParticipantRecord[] | null) ?? [])
            .filter((participant) => participant.duel_id === duel.id)
            .some((participant) => participant.id === member.duel_participant_id)
        ),
        entries: ((entries as DuelEntryRecord[] | null) ?? []).filter((entry) => entry.duel_id === duel.id),
        permissionProfileIds: (((permissions as Array<{ duel_id: string; profile_id: string }> | null) ?? [])
          .filter((permission) => permission.duel_id === duel.id)
          .map((permission) => permission.profile_id))
      })
    )
    .filter((card): card is DuelCard => card !== null);

  return {
    profile,
    plannedDuels: cards.filter((duel) => isPlannedCampaign(duel.start_at)),
    activeDuels: cards.filter((duel) => isSalesWindowOpen(duel.start_at, duel.end_at)),
    finishedDuels: cards.filter((duel) => isRecentFinishedCampaign(duel.end_at))
  };
}
