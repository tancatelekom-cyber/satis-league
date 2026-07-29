"use client";

import { useState } from "react";
import { createRequestAction } from "@/app/talepler/actions";
import type { RequestType } from "@/lib/types";

export function RequestCreateForm() {
  const [type, setType] = useState<RequestType>("annual_leave");
  const [startDate, setStartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const isLeave = type === "annual_leave" || type === "excuse_leave";
  const isSameDayLeave = isLeave && startDate !== "" && startDate === returnDate;

  return (
    <form action={createRequestAction} className="request-form">
      <label>
        Talep türü
        <select name="requestType" required value={type} onChange={(event) => setType(event.target.value as RequestType)}>
          <option value="annual_leave">Yıllık izin</option>
          <option value="excuse_leave">Mazeret izni</option>
          <option value="advance">Avans</option>
          <option value="other">Diğer</option>
        </select>
      </label>

      {isLeave ? (
        <>
          <label>Başlangıç tarihi<input name="startDate" type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>İş başı yapacağınız tarih<input name="endDate" type="date" required value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label>
          {isSameDayLeave ? (
            <div className="request-time-range request-form-wide">
              <label>İzin başlangıç saati<input name="startTime" type="time" required /></label>
              <label>İş başı saati<input name="endTime" type="time" required /></label>
            </div>
          ) : null}
          <label className="request-form-wide">Açıklama / mazeret<textarea name="description" rows={3} placeholder="İzin talebinizle ilgili açıklama ekleyin." /></label>
        </>
      ) : null}

      {type === "advance" ? (
        <>
          <label>Avansın ihtiyaç olduğu tarih<input name="neededDate" type="date" required /></label>
          <label>Avans tutarı (₺)<input name="advanceAmount" type="number" min="1" step="0.01" required placeholder="Örn. 5000" /></label>
        </>
      ) : null}

      {type === "other" ? (
        <label className="request-form-wide">
          Talebiniz
          <textarea name="otherText" rows={4} required maxLength={1000} placeholder="Talebinizi yazın." />
        </label>
      ) : null}

      <button className="request-primary-button" type="submit">Talebi oluştur</button>
    </form>
  );
}
