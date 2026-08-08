"use client";

import { useActionState, useState } from "react";
import { createAdminCase, type CaseGenerationState } from "@/app/adm/cases/actions";
import {
  getMinimumCluesPerPlayer,
  getTrueCluePercentageStates,
} from "@/lib/room-config";

const initialState: CaseGenerationState = {};

function snapToClosestState(value: number, states: number[]) {
  return states.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
  );
}

function getAdjacentState(value: number, states: number[], direction: -1 | 1) {
  const index = states.indexOf(value);
  const currentIndex = index >= 0 ? index : states.indexOf(snapToClosestState(value, states));
  return states[Math.min(states.length - 1, Math.max(0, currentIndex + direction))];
}

function ValueControl({
  description,
  label,
  max,
  min,
  name,
  onChange,
  pending,
  step = 1,
  suffix = "",
  value,
  values,
}: {
  description: string;
  label: string;
  max: number;
  min: number;
  name: string;
  onChange: (value: number) => void;
  pending: boolean;
  step?: number;
  suffix?: string;
  value: number;
  values?: number[];
}) {
  const decrementValue = values ? getAdjacentState(value, values, -1) : value - step;
  const incrementValue = values ? getAdjacentState(value, values, 1) : value + step;

  return (
    <div className="rounded-lg border border-stone-700 bg-[#171b16] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-sm font-bold text-[#d7b861]">{label}</span>
          <p className="mt-1 text-xs leading-5 text-stone-400">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#d7b861]/25 bg-[#0f120e] px-3 py-1 text-xs font-bold text-stone-400">
          {min}-{max}{suffix}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <button
          aria-label={`Diminuir ${label}`}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-700 bg-[#0f120e] text-lg font-black text-stone-100 transition hover:border-[#d7b861] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || value <= min}
          onClick={() => onChange(decrementValue)}
          type="button"
        >
          -
        </button>
        <input
          aria-label={label}
          className="w-full accent-[#d7b861] disabled:opacity-60"
          disabled={pending}
          max={max}
          min={min}
          name={name}
          onChange={(event) => onChange(Number(event.target.value))}
          step={values ? 1 : step}
          type="range"
          value={value}
        />
        <button
          aria-label={`Aumentar ${label}`}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-700 bg-[#0f120e] text-lg font-black text-stone-100 transition hover:border-[#d7b861] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || value >= max}
          onClick={() => onChange(incrementValue)}
          type="button"
        >
          +
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <label className="text-xs font-semibold text-stone-500" htmlFor={`admin-${name}`}>Valor exato</label>
        <div className="flex items-center gap-2">
          <input
            aria-label={`Valor exato de ${label}`}
            className="h-10 w-24 rounded-lg border border-stone-700 bg-[#0f120e] px-3 text-center font-bold text-[#fff3cf] outline-none transition focus:border-[#d7b861] focus:ring-4 focus:ring-[#d7b861]/20 disabled:opacity-60"
            disabled={pending}
            id={`admin-${name}`}
            max={max}
            min={min}
            onChange={(event) => onChange(Number(event.target.value))}
            step={values ? 1 : step}
            type="number"
            value={value}
          />
          {suffix ? <span className="w-5 text-sm font-bold text-stone-400">{suffix}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function CaseGenerator() {
  const [state, formAction, pending] = useActionState(createAdminCase, initialState);
  const [playerCount, setPlayerCount] = useState(1);
  const [clueCount, setClueCount] = useState(6);
  const [trueCluePercentage, setTrueCluePercentage] = useState(50);
  const trueClueStates = getTrueCluePercentageStates(playerCount, clueCount);
  const totalClues = playerCount * clueCount;
  const trueClueCount = Math.round((totalClues * trueCluePercentage) / 100);

  function updatePlayerCount(nextPlayerCount: number) {
    const normalized = Math.min(10, Math.max(1, Math.round(nextPlayerCount)));
    const nextClueCount = Math.max(
      getMinimumCluesPerPlayer(normalized),
      clueCount,
    );
    setPlayerCount(normalized);
    setClueCount(nextClueCount);
    setTrueCluePercentage((current) =>
      snapToClosestState(
        current,
        getTrueCluePercentageStates(normalized, nextClueCount),
      ),
    );
  }

  function updateClueCount(nextClueCount: number) {
    const normalized = Math.min(
      10,
      Math.max(getMinimumCluesPerPlayer(playerCount), Math.round(nextClueCount)),
    );
    setClueCount(normalized);
    setTrueCluePercentage((current) =>
      snapToClosestState(current, getTrueCluePercentageStates(playerCount, normalized)),
    );
  }

  function updateTrueCluePercentage(nextPercentage: number) {
    setTrueCluePercentage(snapToClosestState(nextPercentage, trueClueStates));
  }

  return (
    <section className="mt-10 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-5 shadow-2xl shadow-black/20">
      <h2 className="font-serif text-2xl font-bold text-[#f2e6c8]">Criar caso para o banco</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
        O caso é salvo no arquivo, sem ser associado a uma sala ou partida.
      </p>
      <form action={formAction} className="mt-5 space-y-4">
        <ValueControl
          description="Quantidade de participantes usada para dimensionar o dossiê."
          label="Número de usuários"
          max={10}
          min={1}
          name="playerCount"
          onChange={updatePlayerCount}
          pending={pending}
          value={playerCount}
        />
        <ValueControl
          description="Quantidade de pistas que cada participante receberia."
          label="Pistas por jogador"
          max={10}
          min={getMinimumCluesPerPlayer(playerCount)}
          name="clueCount"
          onChange={updateClueCount}
          pending={pending}
          value={clueCount}
        />
        <ValueControl
          description="Percentual do conjunto total que será formado por evidências confiáveis."
          label="Pistas verdadeiras"
          max={100}
          min={trueClueStates[0]}
          name="trueCluePercentage"
          onChange={updateTrueCluePercentage}
          pending={pending}
          suffix="%"
          value={trueCluePercentage}
          values={trueClueStates}
        />
        <p className="text-xs font-semibold text-stone-500">
          {trueClueCount} de {totalClues} pistas verdadeiras.
        </p>
        {state.error ? <p className="text-sm text-red-200" role="alert">{state.error}</p> : null}
        <button
          className="w-fit rounded-sm bg-[#d0a85c] px-5 py-3 text-sm font-black uppercase tracking-[0.15em] text-[#171a1a] disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Criando caso…" : "Criar caso"}
        </button>
      </form>
    </section>
  );
}
