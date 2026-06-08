"use client";

export function OpenEvaluationPresentationButton() {
  function handleOpen() {
    window.dispatchEvent(new CustomEvent("evaluation-presentation-open"));
  }

  return (
    <button className="button-primary" type="button" onClick={handleOpen}>
      Sunumu Ac
    </button>
  );
}
