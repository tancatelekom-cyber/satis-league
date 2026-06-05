"use client";

function findDailyNeedIndex(text: string) {
  const lowered = text.toLocaleLowerCase("tr-TR");
  const phrases = ["günlük en az", "gunluk en az", "günlük minimum", "gunluk minimum"];

  for (const phrase of phrases) {
    const index = lowered.indexOf(phrase);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function renderBulletLine(line: string) {
  const content = line.replace(/^- /, "");
  const separatorIndex = content.indexOf(":");
  const dailyNeedIndex = findDailyNeedIndex(content);

  const categoryLabel = separatorIndex >= 0 ? content.slice(0, separatorIndex + 1) : "";
  const remainder = separatorIndex >= 0 ? content.slice(separatorIndex + 1) : content;
  const regularText =
    dailyNeedIndex >= 0
      ? content.slice(separatorIndex >= 0 ? separatorIndex + 1 : 0, dailyNeedIndex)
      : remainder;
  const dailyNeedText = dailyNeedIndex >= 0 ? content.slice(dailyNeedIndex) : "";

  return (
    <>
      <span className="evaluation-line-bullet">- </span>
      {categoryLabel ? <strong className="evaluation-line-key">{categoryLabel}</strong> : null}
      {regularText ? <span>{regularText}</span> : null}
      {dailyNeedText ? <strong className="evaluation-line-need">{dailyNeedText}</strong> : null}
    </>
  );
}

export function FormattedCoachingText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="evaluation-copy-text" role="textbox" aria-readonly="true">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={`blank-${index}`} className="evaluation-line-spacer" aria-hidden="true" />;
        }

        if (!trimmed.startsWith("-")) {
          return (
            <p key={`heading-${index}`} className="evaluation-line evaluation-line-heading">
              <strong>{trimmed}</strong>
            </p>
          );
        }

        return (
          <p key={`item-${index}`} className="evaluation-line">
            {renderBulletLine(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
