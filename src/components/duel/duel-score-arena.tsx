"use client";

import { useState } from "react";

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
  title?: string;
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

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;

  let shortened = text;
  while (shortened.length > 3 && context.measureText(`${shortened}...`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
}

async function buildArenaPng(
  title: string,
  matchups: ArenaMatchup[],
  scoring: "points" | "quantity"
) {
  const canvas = document.createElement("canvas");
  const width = 1080;
  const headerHeight = 190;
  const matchupHeight = 360;
  const height = headerHeight + Math.max(matchups.length, 1) * matchupHeight + 70;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Gorsel olusturulamadi.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#071426");
  background.addColorStop(0.5, "#102746");
  background.addColorStop(1, "#071426");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.textAlign = "center";
  context.fillStyle = "#ffcf5a";
  context.font = "900 30px Arial";
  context.fillText("CANLI DUELLO", width / 2, 54);
  context.fillStyle = "#ffffff";
  context.font = "900 56px Arial";
  context.fillText(fitText(context, title, 950), width / 2, 122);
  context.fillStyle = "#a9c9ee";
  context.font = "700 24px Arial";
  context.fillText("ANLIK SKOR TABLOSU", width / 2, 164);

  matchups.forEach((matchup, index) => {
    const top = headerHeight + index * matchupHeight;
    const left = matchup.participants[0] ?? null;
    const right = matchup.participants[1] ?? null;
    const leftScore = left?.score ?? 0;
    const rightScore = right?.score ?? 0;
    const leftWins = leftScore > rightScore;
    const rightWins = rightScore > leftScore;
    const draw = leftScore === rightScore;
    const cardWidth = 425;
    const cardHeight = 280;
    const cardTop = top + 28;

    [
      { participant: left, score: leftScore, wins: leftWins, x: 55, align: "left" as const },
      { participant: right, score: rightScore, wins: rightWins, x: 600, align: "right" as const }
    ].forEach((side) => {
      const loses = !draw && !side.wins;
      const cardGradient = context.createLinearGradient(side.x, cardTop, side.x + cardWidth, cardTop + cardHeight);
      if (side.wins) {
        cardGradient.addColorStop(0, "#176b4d");
        cardGradient.addColorStop(1, "#07362f");
      } else if (loses) {
        cardGradient.addColorStop(0, "#6d2637");
        cardGradient.addColorStop(1, "#2d111d");
      } else {
        cardGradient.addColorStop(0, "#185e73");
        cardGradient.addColorStop(1, "#12344f");
      }

      roundedRect(context, side.x, cardTop, cardWidth, cardHeight, 34);
      context.fillStyle = cardGradient;
      context.fill();
      context.lineWidth = 5;
      context.strokeStyle = side.wins ? "#48e890" : loses ? "#ff6060" : "#66e0dc";
      context.stroke();

      const centerX = side.x + cardWidth / 2;
      context.textAlign = "center";
      context.fillStyle = side.wins ? "#a7ffd0" : loses ? "#ffb3b3" : "#9ff7ef";
      context.font = "900 22px Arial";
      context.fillText(draw ? "BERABERE" : side.wins ? "KAZANIYOR" : "KAYBEDIYOR", centerX, cardTop + 44);
      context.fillStyle = "#ffffff";
      context.font = "900 34px Arial";
      context.fillText(fitText(context, side.participant?.label ?? "Taraf", 370), centerX, cardTop + 92);
      context.font = "900 66px Arial";
      context.fillText(scoreLabel(side.score, scoring), centerX, cardTop + 168);
      context.fillStyle = side.wins ? "#d2ffe5" : loses ? "#ffd0d0" : "#d8ffff";
      context.font = "700 21px Arial";
      context.fillText(fitText(context, outcomeLabel(side.participant), 370), centerX, cardTop + 225);
    });

    context.beginPath();
    context.arc(width / 2, cardTop + cardHeight / 2, 66, 0, Math.PI * 2);
    context.fillStyle = "#10213c";
    context.fill();
    context.lineWidth = 6;
    context.strokeStyle = "#ffcb52";
    context.stroke();
    context.fillStyle = "#fff8d7";
    context.font = "italic 900 46px Arial";
    context.textAlign = "center";
    context.fillText("VS", width / 2, cardTop + cardHeight / 2 + 16);
  });

  context.fillStyle = "#7895b8";
  context.font = "600 18px Arial";
  context.textAlign = "center";
  context.fillText("TANCA+ DUELLO", width / 2, height - 28);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gorsel olusturulamadi."))), "image/png");
  });
}

export function DuelScoreArena({ matchups, scoring, title = "Duello Skor Tablosu" }: DuelScoreArenaProps) {
  const [shareMessage, setShareMessage] = useState("");

  async function downloadImage() {
    try {
      const blob = await buildArenaPng(title, matchups, scoring);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${title.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, "-") || "duello"}-skor.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      setShareMessage("Gorsel indirildi. Galerinizden WhatsApp ile paylasabilirsiniz.");
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "Gorsel indirilemedi.");
    }
  }

  async function shareImage() {
    try {
      const blob = await buildArenaPng(title, matchups, scoring);
      const file = new File([blob], "duello-skor.png", { type: "image/png" });

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title, text: `${title} anlik skor tablosu`, files: [file] });
        setShareMessage("Paylasim menusu acildi.");
        return;
      }

      await downloadImage();
      setShareMessage("Telefonunuz dogrudan paylasimi desteklemiyor. Gorsel indirildi.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage(error instanceof Error ? error.message : "Gorsel paylasilamadi.");
    }
  }

  return (
    <>
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

      <div className="duel-image-actions">
        <button className="duel-image-button" onClick={downloadImage} type="button">
          Resmi Indir
        </button>
        <button className="duel-image-button duel-share-button" onClick={shareImage} type="button">
          WhatsApp / Paylas
        </button>
      </div>
      {shareMessage ? <p className="duel-image-feedback">{shareMessage}</p> : null}
    </>
  );
}
