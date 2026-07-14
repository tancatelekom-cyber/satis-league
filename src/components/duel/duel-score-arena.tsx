type ArenaParticipant = {
  id: string;
  label: string;
  score: number;
  currentResult: "winning" | "losing" | "draw";
  currentDescription: string | null;
};

type ArenaMatchup = {
  matchupNo: number;
  participants: ArenaParticipant[];
};

type DuelScoreArenaProps = {
  matchups: ArenaMatchup[];
  scoring: "points" | "quantity";
};

function scoreLabel(value: number, scoring: "points" | "quantity") {
  return `${value.toFixed(0)} ${scoring === "points" ? "puan" : "adet"}`;
}

function outcomeLabel(participant: ArenaParticipant | null) {
  if (!participant || participant.currentResult === "draw") {
    return "Sonuc: Su an berabere";
  }

  const prefix = participant.currentResult === "winning" ? "Odul" : "Sonuc";
  const fallback = participant.currentResult === "winning" ? "Su an onde" : "Su an geride";
  return `${prefix}: ${participant.currentDescription ?? fallback}`;
}

export function DuelScoreArena({ matchups, scoring }: DuelScoreArenaProps) {
  return (
    <div className="duel-matchup-compact">
      <div className="duel-matchup-compact-head">
        <span>RAKIP A</span>
        <span aria-hidden="true"></span>
        <span>RAKIP B</span>
      </div>

      {matchups.map((matchup) => {
        const leftParticipant = matchup.participants[0] ?? null;
        const rightParticipant = matchup.participants[1] ?? null;
        const leftScore = leftParticipant?.score ?? 0;
        const rightScore = rightParticipant?.score ?? 0;
        const leftWins = leftScore > rightScore;
        const rightWins = rightScore > leftScore;
        const isDraw = leftScore === rightScore;

        return (
          <div key={`matchup-${matchup.matchupNo}`} className="duel-matchup-compact-row">
            <span
              className={[
                "duel-matchup-compact-person",
                "duel-matchup-side-left",
                leftWins ? "duel-matchup-compact-winner" : "",
                rightWins ? "duel-matchup-compact-loser" : "",
                isDraw ? "duel-matchup-compact-draw" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="duel-player-status">
                {isDraw ? "BERABERE" : leftWins ? "KAZANIYOR" : "KAYBEDIYOR"}
              </span>
              <strong className="duel-matchup-compact-name">{leftParticipant?.label ?? "Taraf 1"}</strong>
              <small className="duel-matchup-score">{scoreLabel(leftScore, scoring)}</small>
              <small className="duel-current-outcome">{outcomeLabel(leftParticipant)}</small>
            </span>

            <span className="duel-clash-mark" aria-label="karsilasma">
              <span className="duel-clash-bolt" aria-hidden="true">{"\u26A1"}</span>
              <strong>VS</strong>
              <small>KAPISMA</small>
            </span>

            <span
              className={[
                "duel-matchup-compact-person",
                "duel-matchup-side-right",
                rightWins ? "duel-matchup-compact-winner" : "",
                leftWins ? "duel-matchup-compact-loser" : "",
                isDraw ? "duel-matchup-compact-draw" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="duel-player-status">
                {isDraw ? "BERABERE" : rightWins ? "KAZANIYOR" : "KAYBEDIYOR"}
              </span>
              <strong className="duel-matchup-compact-name">{rightParticipant?.label ?? "Taraf 2"}</strong>
              <small className="duel-matchup-score">{scoreLabel(rightScore, scoring)}</small>
              <small className="duel-current-outcome">{outcomeLabel(rightParticipant)}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}
