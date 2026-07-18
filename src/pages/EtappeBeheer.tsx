/**
 * Etappe Beheer page: login gate, data fetching, and the list/view/entry
 * view switch. The views themselves live in src/components/beheer/.
 */

import { useState, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useRefreshTdfData } from '../hooks/useRefreshTdfData';
import { useStagesData } from '../hooks/useTdfData';
import { useAdminRiders } from '../hooks/useAdminData';
import { useAdminSession } from '../hooks/useAdminSession';
import { AdminLogin } from '../components/AdminLogin';
import { getAdminToken, getAdminAuthHeaders, signOutAdmin } from '../lib/adminAuth';
import { StageListView } from '../components/beheer/StageListView';
import { StageViewMode } from '../components/beheer/StageViewMode';
import { StageEntryMode } from '../components/beheer/StageEntryMode';
import {
  EMPTY_FORM_DATA,
  getNextStageNumber,
  routePrefill,
  createFormDataFromStage,
  type StageFormData,
  type SubmitResult,
} from '../components/beheer/stage-form';
import { buildPrefillPatch, type PcsPrefillData } from '../../lib/prefill';

type ViewMode = 'list' | 'entry' | 'view';

function StageManagementPage() {
  const session = useAdminSession();
  const [token, setToken] = useState(getAdminToken());
  const authenticated = Boolean(session.email || token);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillFeedback, setPrefillFeedback] = useState<string[]>([]);
  const { refreshAll } = useRefreshTdfData();

  const [formData, setFormData] = useState<StageFormData>(EMPTY_FORM_DATA);

  // Fetch data. Riders come from the admin API (full startlist), NOT from the
  // public snapshot — that file only contains riders with points (fact 23).
  const { data: adminRiders, isLoading: ridersLoading, error: ridersError } = useAdminRiders(authenticated);
  const { data: stagesData, isLoading: stagesLoading } = useStagesData();

  const loading = ridersLoading || stagesLoading;

  const riders = useMemo(() => adminRiders ?? [], [adminRiders]);

  const stages = useMemo(() => {
    return stagesData || [];
  }, [stagesData]);

  const nextStageNumber = useMemo(() => {
    return getNextStageNumber(stages);
  }, [stages]);

  // Event handlers
  const handleOpenEntry = useCallback((stageNumber: number) => {
    setFormData({
      ...EMPTY_FORM_DATA,
      ...routePrefill(stageNumber),
      stage_number: stageNumber,
    });
    setViewMode('entry');
    setSuccessMessage('');
    setErrorMessage('');
    setSubmitResult(null);
    setPrefillFeedback([]);
  }, []);

  const handleViewStage = useCallback((stageNumber: number) => {
    const stage = stages.find(s => s.stage_number === stageNumber);
    if (!stage) {
      setErrorMessage('Stage not found');
      return;
    }

    setFormData(createFormDataFromStage(stage));
    setViewMode('view');
  }, [stages]);

  const handleEditMode = useCallback(() => {
    setViewMode('entry');
  }, []);

  const handleUpdateFinisher = useCallback((index: number, riderName: string) => {
    setFormData(prev => ({
      ...prev,
      top_20_finishers: prev.top_20_finishers.map((f, i) =>
        i === index ? { rider_name: riderName, position: index + 1 } : f
      )
    }));
  }, []);

  // PCS-prefill: fetch raw results server-side, match client-side with the
  // paste flow's matcher, and fill the form. Only non-empty values are
  // applied, so re-fetching later (e.g. when strijdlust comes online) never
  // wipes fields the beheerder already filled in. Review + save unchanged.
  const handlePcsPrefill = useCallback(async () => {
    setPrefilling(true);
    setPrefillFeedback([]);
    try {
      const response = await fetch(
        `/api/admin/prefill-stage?stage=${formData.stage_number}`,
        { headers: await getAdminAuthHeaders() }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || `PCS ophalen mislukt (${response.status})`);
      }
      const data: PcsPrefillData = body.data;
      const { patch, feedback, matchedCount } = buildPrefillPatch(data, riders);

      setFormData(prev => ({
        ...prev,
        top_20_finishers: prev.top_20_finishers.map((f, i) =>
          patch.top_20_finishers[i].rider_name ? patch.top_20_finishers[i] : f
        ),
        jerseys: {
          yellow: patch.jerseys.yellow || prev.jerseys.yellow,
          green: patch.jerseys.green || prev.jerseys.green,
          polka_dot: patch.jerseys.polka_dot || prev.jerseys.polka_dot,
          white: patch.jerseys.white || prev.jerseys.white,
        },
        combativity: patch.combativity || prev.combativity,
        dagploeg: patch.dagploeg || prev.dagploeg,
        won_how: patch.won_how || prev.won_how,
        dnf_riders: [...new Set([...prev.dnf_riders, ...patch.dnf_riders])],
        dns_riders: [...new Set([...prev.dns_riders, ...patch.dns_riders])],
      }));
      setPrefillFeedback([
        `${matchedCount} van 20 posities ingevuld vanaf PCS — controleer en sla daarna op.`,
        ...(data.warnings ?? []),
        ...feedback,
      ]);
    } catch (error: any) {
      setPrefillFeedback([error.message || 'PCS ophalen mislukt']);
    } finally {
      setPrefilling(false);
    }
  }, [formData.stage_number, riders]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.date || !formData.departure_city || !formData.arrival_city) {
      setErrorMessage('Vul alle verplichte velden in');
      return;
    }

    const validFinishers = formData.top_20_finishers.filter(f => f.rider_name.trim() !== '');

    if (validFinishers.length === 0) {
      setErrorMessage('Voeg minimaal 1 renner toe aan de uitslag');
      return;
    }

    if (!formData.jerseys.yellow || !formData.jerseys.green ||
        !formData.jerseys.polka_dot || !formData.jerseys.white) {
      setErrorMessage('Vul alle truien in');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSubmitResult(null);

    try {
      // Check if stage is already complete
      const existingStage = stages.find(s => s.stage_number === formData.stage_number);
      let shouldForce = false;

      if (existingStage?.is_complete) {
        const confirmReprocess = window.confirm(
          `⚠️ Etappe ${formData.stage_number} is al verwerkt.\n\n` +
          `Wil je deze etappe opnieuw invoeren en verwerken?\n\n` +
          `Dit zal de bestaande resultaten overschrijven.`
        );

        if (!confirmReprocess) {
          setSubmitting(false);
          setErrorMessage('Bewerking geannuleerd');
          return;
        }

        shouldForce = true;
      }

      // One atomic call: validate → save → recalculate → publish (WP-A2)
      const response = await fetch('/api/admin/enter-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAdminAuthHeaders()) },
        body: JSON.stringify({
          ...formData,
          top_20_finishers: validFinishers,
          force: shouldForce,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        if (Array.isArray(body.validation_errors)) {
          setErrorMessage(
            ['Niet opgeslagen — er is niets gewijzigd:', ...body.validation_errors].join('\n')
          );
          // The outcome renders at the top of the form; the save button is
          // at the bottom — without this, a result looks like "nothing
          // happened" (stage-10 cutover experience).
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        throw new Error(body.error || 'Verwerken mislukt');
      }

      const data: SubmitResult = body.data;
      setSubmitResult(data);
      setSuccessMessage(`✅ Etappe ${formData.stage_number} opgeslagen en verwerkt!`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await refreshAll();

      // Warnings and substitutions must stay on screen (fact 5): only
      // return to the list automatically when there is nothing to review.
      const nothingToReview =
        (data.warnings?.length ?? 0) === 0 && (data.substitutions?.length ?? 0) === 0;
      if (nothingToReview) {
        setTimeout(() => {
          setViewMode('list');
          setSuccessMessage('✅ Data succesvol bijgewerkt!');
          setTimeout(() => setSuccessMessage(''), 2000);
        }, 1500);
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      setErrorMessage(error.message || 'Er is een fout opgetreden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }, [formData, stages, refreshAll]);

  // Login gate (WP-A4): OTP-sessie of beheertoken vereist
  if (session.loading) {
    return (
      <Layout title="Etappe Beheer">
        <div className="text-center py-12">Laden...</div>
      </Layout>
    );
  }

  if (!authenticated) {
    return (
      <Layout title="Etappe Beheer">
        <AdminLogin onTokenLogin={setToken} />
      </Layout>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Layout title="Etappe Beheer">
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Etappe Beheer">
      <main>
        <div className="flex justify-end items-center gap-3 mb-2 text-sm text-gray-500">
          <span>Ingelogd{session.email ? ` als ${session.email}` : ' met beheertoken'}</span>
          <button
            onClick={async () => {
              await signOutAdmin();
              setToken('');
            }}
            className="text-tdf-primary hover:underline"
          >
            Uitloggen
          </button>
        </div>

        {viewMode === 'list' && (
          <StageListView
            stages={stages}
            nextStageNumber={nextStageNumber}
            successMessage={successMessage}
            onViewStage={handleViewStage}
            onOpenEntry={handleOpenEntry}
          />
        )}

        {viewMode === 'view' && (
          <StageViewMode
            formData={formData}
            onBack={() => setViewMode('list')}
            onEdit={handleEditMode}
          />
        )}

        {viewMode === 'entry' && (
          <StageEntryMode
            formData={formData}
            riders={riders}
            stages={stages}
            submitting={submitting}
            successMessage={successMessage}
            errorMessage={ridersError ? String(ridersError) : errorMessage}
            submitResult={submitResult}
            onBack={() => setViewMode('list')}
            onSubmit={handleSubmit}
            onUpdateFormData={setFormData}
            onUpdateFinisher={handleUpdateFinisher}
            onPcsPrefill={handlePcsPrefill}
            prefilling={prefilling}
            prefillFeedback={prefillFeedback}
          />
        )}
      </main>
    </Layout>
  );
}

export default StageManagementPage;
