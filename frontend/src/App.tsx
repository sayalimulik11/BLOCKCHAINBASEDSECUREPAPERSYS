import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppShell } from "./shell/AppShell";
import { ComponentGallery } from "./gallery/ComponentGallery";
import { Button } from "@sigil/ui";
import { ParticipantsContainer } from "./pages/participants/ParticipantsContainer";
import { DocketContainer } from "./pages/docket/DocketContainer";
import { CreateExamContainer } from "./pages/create-exam/CreateExamContainer";
import { KeyCeremonyContainer } from "./pages/key-ceremony/KeyCeremonyContainer";
import { CommandCentreContainer } from "./pages/command-centre/CommandCentreContainer";
import { SetterAssignmentsContainer } from "./pages/setter/SetterAssignmentsContainer";
import { QuestionComposerContainer } from "./pages/setter/QuestionComposerContainer";
import { HolderAssignmentsContainer } from "./pages/holder/HolderAssignmentsContainer";
import { HolderConsoleContainer } from "./pages/holder/HolderConsoleContainer";

type ApiStatus = "checking" | "online" | "offline";
const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:4000";

function HomeView() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const { roles } = useAuth();

  async function checkApi() {
    setApiStatus("checking");
    try {
      const response = await fetch(`${apiOrigin}/api/health`);
      setApiStatus(response.ok ? "online" : "offline");
    } catch {
      setApiStatus("offline");
    }
  }

  useEffect(() => {
    void checkApi();
  }, []);

  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <p className="eyebrow">Time-locked, threshold-controlled paper custody</p>
      <h1 id="welcome-title">SIGIL Custody Console</h1>
      <p className="intro">
        Examination question banks are split with Shamir secret sharing and released only inside an on-chain time window.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', margin: '24px 0' }}>
        <div style={{ background: 'var(--sigil-color-sheet)', border: '1px solid var(--sigil-color-hairline)', padding: '16px', borderRadius: '3px' }}>
          <h3 style={{ fontSize: '15px', margin: '0 0 6px 0' }}>Authority docket</h3>
          <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
            Draft, schedule, run key ceremonies, and seal examinations.
          </p>
          <Link to="/authority/docket">
            <Button size="sm" variant="secondary">Open docket</Button>
          </Link>
        </div>

        <div style={{ background: 'var(--sigil-color-sheet)', border: '1px solid var(--sigil-color-hairline)', padding: '16px', borderRadius: '3px' }}>
          <h3 style={{ fontSize: '15px', margin: '0 0 6px 0' }}>Admin participants</h3>
          <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
            Register and revoke authorized Authority, Setter, Holder, and Centre roles.
          </p>
          <Link to="/admin/participants">
            <Button size="sm" variant="secondary">Manage participants</Button>
          </Link>
        </div>

        <div style={{ background: 'var(--sigil-color-sheet)', border: '1px solid var(--sigil-color-hairline)', padding: '16px', borderRadius: '3px' }}>
          <h3 style={{ fontSize: '15px', margin: '0 0 6px 0' }}>Security design system</h3>
          <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
            Inspect security-paper tokens, Radix UI primitives, rosettes, and guard screens.
          </p>
          <Link to="/dev/gallery">
            <Button size="sm" variant="primary">Component gallery</Button>
          </Link>
        </div>
      </div>

      <div className="status-card" role="status" aria-live="polite">
        <span className={`status-dot ${apiStatus}`} aria-hidden="true" />
        <div>
          <strong>Backend API connection</strong>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
            {apiStatus === "checking" ? "Checking connection to ledger..." : apiStatus === "online" ? "Connected to Hardhat indexer" : "Offline / Unavailable"}
          </p>
        </div>
        {apiStatus === "offline" && <Button size="sm" variant="secondary" onClick={() => void checkApi()}>Retry</Button>}
      </div>
    </section>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/dev/gallery"
            element={
              <AppShell requireAuth={false}>
                <ComponentGallery />
              </AppShell>
            }
          />
          {/* Admin Participants routes */}
          <Route
            path="/admin/participants"
            element={
              <AppShell requireAuth={true} requiredRoles={["ADMIN"]}>
                <ParticipantsContainer />
              </AppShell>
            }
          />
          <Route
            path="/participants"
            element={
              <AppShell requireAuth={true} requiredRoles={["ADMIN"]}>
                <ParticipantsContainer />
              </AppShell>
            }
          />
          {/* Authority Docket routes */}
          <Route
            path="/authority/docket"
            element={
              <AppShell requireAuth={true} requiredRoles={["AUTHORITY"]}>
                <DocketContainer />
              </AppShell>
            }
          />
          <Route
            path="/authority/create"
            element={
              <AppShell requireAuth={true} requiredRoles={["AUTHORITY"]}>
                <CreateExamContainer />
              </AppShell>
            }
          />
          <Route
            path="/authority/exams/:examId/ceremony"
            element={
              <AppShell requireAuth={true} requiredRoles={["AUTHORITY"]}>
                <KeyCeremonyContainer />
              </AppShell>
            }
          />
          <Route
            path="/authority/exams/:examId"
            element={
              <AppShell requireAuth={true} requiredRoles={["AUTHORITY"]}>
                <CommandCentreContainer />
              </AppShell>
            }
          />
          <Route
            path="/docket"
            element={
              <AppShell requireAuth={true} requiredRoles={["AUTHORITY"]}>
                <DocketContainer />
              </AppShell>
            }
          />
          <Route
            path="/setter/assignments"
            element={
              <AppShell requireAuth={true} requiredRoles={["SETTER"]}>
                <SetterAssignmentsContainer />
              </AppShell>
            }
          />
          <Route
            path="/setter/batches"
            element={
              <AppShell requireAuth={true} requiredRoles={["SETTER"]}>
                <SetterAssignmentsContainer />
              </AppShell>
            }
          />
          <Route
            path="/setter/exams/:examId/questions"
            element={
              <AppShell requireAuth={true} requiredRoles={["SETTER"]}>
                <QuestionComposerContainer />
              </AppShell>
            }
          />
          <Route
            path="/holder/console"
            element={
              <AppShell requireAuth={true} requiredRoles={["HOLDER"]}>
                <HolderAssignmentsContainer />
              </AppShell>
            }
          />
          <Route
            path="/holder/exams/:examId"
            element={
              <AppShell requireAuth={true} requiredRoles={["HOLDER"]}>
                <HolderConsoleContainer />
              </AppShell>
            }
          />
          <Route
            path="*"
            element={
              <AppShell requireAuth={false}>
                <HomeView />
              </AppShell>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
