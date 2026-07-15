/**
 * Etappes Page — public, read-only race results per stage.
 *
 * The race itself (results, jerseys, strijdlust, dagploeg, DNF), separate from
 * the pool scoring views. Per-stage points are joined from the riders snapshot
 * (which keeps every rider's per-stage breakdown), so the results list doubles
 * as the rider stage ranking and also carries the jersey/strijdlust-only
 * scorers below the top-20.
 */

import { useState, useMemo } from 'react';
import { useMetadata, useStagesData, useRiders } from '../hooks/useTdfData';
import { usePageTitle } from '../hooks/usePageTitle';
import { LoadingState, ErrorState } from '../components/StatusStates';
import { MedalIcon } from '../components/shared/MedalDisplay';
import { CombativityIcon } from '../components/shared/CombativityIcon';
import { DagploegIcon } from '../components/shared/DagploegIcon';
import { JERSEY_ICONS, JERSEY_LABELS, LABELS } from '../../lib/constants';
import type { StageData, RiderStageData } from '../../lib/types';

const TOTAL_STAGES = 21; // Tour de France
const JERSEY_ORDER = ['yellow', 'green', 'polka_dot', 'white'] as const;

/** Stage number chips 1..21; completed stages are selectable, the rest muted. */
function StageSelector({
  completed,
  selected,
  onSelect,
}: {
  completed: Set<number>;
  selected: number;
  onSelect: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-6 justify-center">
      {Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1).map((n) => {
        const isDone = completed.has(n);
        const isActive = n === selected;
        return (
          <button
            key={n}
            onClick={() => isDone && onSelect(n)}
            disabled={!isDone}
            aria-current={isActive ? 'true' : undefined}
            className={`w-10 h-10 rounded-lg font-semibold text-sm transition-all ${
              isActive
                ? 'bg-tdf-accent text-tdf-on-accent'
                : isDone
                ? 'bg-tdf-button-inactive text-tdf-button-text hover:brightness-95'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/** Route + facts card for the selected stage. Every field is nullable. */
function StageHeader({ stage }: { stage: StageData }) {
  const dateLabel = stage.date
    ? new Date(stage.date).toLocaleDateString('nl-NL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;
  const route =
    stage.departure_city && stage.arrival_city
      ? `${stage.departure_city} → ${stage.arrival_city}`
      : null;
  const facts = [
    stage.distance ? `${stage.distance} km` : null,
    stage.stage_type || stage.difficulty,
  ].filter(Boolean);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4">
      <h2 className="text-lg sm:text-2xl font-bold text-tdf-heading">
        Etappe {stage.stage_number}
        {dateLabel && <span className="font-normal text-tdf-text-secondary"> · {dateLabel}</span>}
      </h2>
      {route && <p className="text-sm sm:text-base text-tdf-text-primary mt-1">{route}</p>}
      {facts.length > 0 && (
        <p className="text-xs sm:text-sm text-tdf-text-secondary mt-1">{facts.join(' · ')}</p>
      )}
      {stage.won_how && (
        <p className="text-xs sm:text-sm text-tdf-text-muted mt-1 italic">Gewonnen: {stage.won_how}</p>
      )}
    </div>
  );
}

/** A fixed 20px slot so every strip icon centers on the same baseline. */
function IconSlot({ children }: { children: React.ReactNode }) {
  return <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">{children}</span>;
}

/** Jersey holders + strijdlust + dagploeg after this stage. */
function JerseyStrip({ stage }: { stage: StageData }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6 px-1">
      {JERSEY_ORDER.map((jersey) =>
        stage.jerseys[jersey] ? (
          <div key={jersey} className="flex items-center gap-2">
            <IconSlot>
              <img src={JERSEY_ICONS[jersey]} alt={JERSEY_LABELS[jersey]} className="w-5 h-5" />
            </IconSlot>
            <span className="text-sm text-tdf-text-primary">{stage.jerseys[jersey]}</span>
          </div>
        ) : null
      )}
      {stage.combativity && (
        <div className="flex items-center gap-2">
          <IconSlot><CombativityIcon sizePx={15} /></IconSlot>
          <span className="text-sm text-tdf-text-primary">{stage.combativity}</span>
        </div>
      )}
      {stage.dagploeg && (
        <div className="flex items-center gap-2">
          <IconSlot><DagploegIcon sizePx={17} /></IconSlot>
          <span className="text-sm text-tdf-text-primary">{stage.dagploeg}</span>
        </div>
      )}
    </div>
  );
}

function Etappes() {
  usePageTitle(LABELS.ETAPPES);

  const { data: metadata, isLoading: mLoading, error: mError } = useMetadata();
  const { data: stagesData, isLoading: sLoading, error: sError } = useStagesData();
  const { data: ridersData, isLoading: rLoading, error: rError } = useRiders();

  const [selectedStage, setSelectedStage] = useState<number | null>(null);

  const loading = mLoading || sLoading || rLoading;
  const error = mError || sError || rError;

  const completed = useMemo(
    () => new Set((stagesData ?? []).filter((s) => s.is_complete).map((s) => s.stage_number)),
    [stagesData]
  );

  const activeStage = selectedStage ?? metadata?.current_stage ?? 1;
  const stageKey = `stage_${activeStage}`;

  const stage = useMemo(
    () => (stagesData ?? []).find((s) => s.stage_number === activeStage),
    [stagesData, activeStage]
  );

  // Per-rider points for this stage come from the riders snapshot, which keeps
  // every rider's per-stage breakdown (rider_rankings only holds the current
  // stage). name → this-stage RiderStageData.
  const stageByRider = useMemo(() => {
    const map = new Map<string, RiderStageData>();
    for (const [name, rd] of Object.entries(ridersData ?? {})) {
      const s = rd.stages?.[stageKey];
      if (s) map.set(name, s);
    }
    return map;
  }, [ridersData, stageKey]);

  // Jersey/strijdlust scorers who finished outside the top-20, best first —
  // appended to the results below the top-20 as ">20" rows.
  const otherScorers = useMemo(() => {
    if (!stage) return [];
    const finisherNames = new Set(stage.top_20_finishers.map((f) => f.rider_name));
    return [...stageByRider.entries()]
      .filter(([name, s]) => s.stage_total > 0 && !finisherNames.has(name))
      .sort((a, b) => b[1].stage_total - a[1].stage_total)
      .map(([name]) => name);
  }, [stage, stageByRider]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  if (!metadata || !stagesData || !ridersData) return null;

  const finishers = stage?.top_20_finishers ?? [];
  const hasTimeGaps = finishers.some((f) => f.time_gap);
  const hasDropouts = (stage?.dnf_riders.length ?? 0) + (stage?.dns_riders.length ?? 0) > 0;

  const teamOf = (name: string) => ridersData[name]?.team ?? '';
  const pointsOf = (name: string) => stageByRider.get(name)?.stage_total ?? 0;
  const jerseysFor = (name: string): typeof JERSEY_ORDER[number][] =>
    stage ? JERSEY_ORDER.filter((j) => stage.jerseys[j] === name) : [];
  const isCombative = (name: string) => stage?.combativity === name;

  // Top-20 finishers, then the jersey/strijdlust-only scorers as ">20" rows —
  // one list, one card/row treatment. `position: null` renders as ">20".
  type ResultRow = { key: string; position: number | null; name: string; timeGap: string | null };
  const resultRows: ResultRow[] = [
    ...finishers.map((f) => ({
      key: `f${f.position}`,
      position: f.position as number | null,
      name: f.rider_name,
      timeGap: f.time_gap,
    })),
    ...otherScorers.map((name) => ({ key: `o${name}`, position: null, name, timeGap: null })),
  ];

  /** Jersey + strijdlust markers for a rider's row. */
  const RowIcons = ({ name, size }: { name: string; size: number }) => (
    <>
      {jerseysFor(name).map((j) => (
        <img key={j} src={JERSEY_ICONS[j]} alt={JERSEY_LABELS[j]} style={{ width: size, height: size }} className="flex-shrink-0" />
      ))}
      {isCombative(name) && <CombativityIcon sizePx={size} />}
    </>
  );

  return (
    <div className="min-h-screen py-4 px-4 sm:px-6 lg:px-32 bg-tdf-bg">
      <header className="mb-6 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-tdf-primary">Etappes</h1>
      </header>

      <StageSelector completed={completed} selected={activeStage} onSelect={setSelectedStage} />

      {!stage ? (
        <div className="text-center py-12 text-tdf-text-secondary">
          Deze etappe is nog niet verwerkt.
        </div>
      ) : (
        <>
          <StageHeader stage={stage} />
          <JerseyStrip stage={stage} />

          {/* Mobile cards */}
          <div className="block lg:hidden space-y-2">
            {resultRows.map((r) => (
              <div key={r.key} className="bg-white rounded-lg shadow-md p-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 min-w-[44px]">
                    <span className={`font-bold ${r.position === null ? 'text-sm text-tdf-text-muted' : 'text-lg text-tdf-text-primary'}`}>
                      {r.position ?? '>20'}
                    </span>
                    {r.position !== null && <MedalIcon position={r.position} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-tdf-text-primary truncate">{r.name}</span>
                      <RowIcons name={r.name} size={16} />
                    </div>
                    <div className="text-xs text-tdf-text-secondary truncate">{teamOf(r.name)}</div>
                  </div>
                  <div className="text-right">
                    {r.timeGap && <div className="text-xs text-tdf-text-secondary">{r.timeGap}</div>}
                    <div className="text-lg font-bold text-tdf-score">{pointsOf(r.name)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-table-header">
                  <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Positie</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Renner</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Team</th>
                  {hasTimeGaps && (
                    <th className="px-4 py-4 text-right text-sm font-semibold text-tdf-text-highlight">Tijd</th>
                  )}
                  <th className="px-4 py-4 text-right text-sm font-semibold text-tdf-text-highlight">Punten</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map((r, idx) => (
                  <tr key={r.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}>
                    <td className={`px-4 py-3 text-sm font-medium ${r.position === null ? 'text-tdf-text-muted' : ''}`}>
                      {r.position ?? '>20'}
                      {r.position !== null && <MedalIcon position={r.position} className="ml-1" />}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span>{r.name}</span>
                        <RowIcons name={r.name} size={20} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-tdf-text-secondary">{teamOf(r.name)}</td>
                    {hasTimeGaps && (
                      <td className="px-4 py-3 text-sm text-right text-tdf-text-secondary">{r.timeGap ?? ''}</td>
                    )}
                    <td className="px-4 py-3 text-sm text-right font-semibold text-tdf-score">
                      {pointsOf(r.name)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasDropouts && (
            <p className="mt-6 text-xs sm:text-sm text-tdf-text-muted">
              {stage.dnf_riders.length > 0 && <>Uitgevallen (DNF): {stage.dnf_riders.join(', ')}. </>}
              {stage.dns_riders.length > 0 && <>Niet gestart (DNS): {stage.dns_riders.join(', ')}.</>}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default Etappes;
