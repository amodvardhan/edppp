import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Card,
  CardContent,
  TextField,
  Chip,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  alpha,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import AddIcon from "@mui/icons-material/Add";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  projectsApi,
  sprintPlanApi,
  teamApi,
  buRatesApi,
  featuresApi,
  calculationsApi,
  versionsApi,
  STATUS_TRANSITIONS,
  fromApiRow,
  toApiRow,
  type TeamMemberCreate,
  type FeatureCreate,
  type Feature,
  type Project,
  type ProjectVersion,
  type TeamMember,
} from "../lib/api";
import type { FeatureCreateWithId } from "../components/FeaturesTasksGrid";
import { useAuth } from "../contexts/AuthContext";
import FeaturesTasksGrid from "../components/FeaturesTasksGrid";
import { CONFIG } from "../config";
import SprintPlanningGrid, {
  computeRoleCapacity,
  createInitialSprintPlanning,
  ensurePhasesAtEnd,
  migrateToSprintFormat,
  type SprintPlanningRow,
} from "../components/SprintPlanningGrid";

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function featureToCreateWithId(f: Feature): FeatureCreateWithId {
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    priority: f.priority,
    effort_hours: f.effort_hours,
    effort_story_points: f.effort_story_points,
    effort_allocations: f.effort_allocations?.map((a) => ({
      role: a.role,
      allocation_pct: a.allocation_pct,
      effort_hours: a.effort_hours,
    })),
    tasks: f.tasks?.map((t) => ({ name: t.name, effort_hours: t.effort_hours, role: t.role })),
  };
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"team" | "features" | "calculations" | "sprint">("features");
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showAddFeature, setShowAddFeature] = useState(false);
  const [showAiUpload, setShowAiUpload] = useState(false);
  const [showAiTeamSuggest, setShowAiTeamSuggest] = useState(false);
  const [reverseMarginTarget, setReverseMarginTarget] = useState(25);
  const [sprintPlan, setSprintPlan] = useState<{
    rows: SprintPlanningRow[];
    roles: string[];
  } | null>(null);
  const saveSprintPlanTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeaturesTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sprintPlanInitializedRef = React.useRef(false);

  const canEditTeam = hasRole("admin") || hasRole("delivery_manager");
  const canEditFeatures = hasRole("admin") || hasRole("delivery_manager") || hasRole("business_analyst");
  const canLock = hasRole("admin") || hasRole("finance_reviewer");
  const canUnlock = hasRole("admin");
  const canDeleteProject = hasRole("admin") || hasRole("delivery_manager") || hasRole("business_analyst") || hasRole("finance_reviewer");

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: projectId > 0,
  });

  const { data: version } = useQuery({
    queryKey: ["version", projectId],
    queryFn: () => versionsApi.getCurrent(projectId),
    enabled: projectId > 0,
  });

  const { data: team } = useQuery({
    queryKey: ["team", projectId],
    queryFn: () => teamApi.list(projectId),
    enabled: projectId > 0,
  });

  const { data: features } = useQuery({
    queryKey: ["features", projectId],
    queryFn: () => featuresApi.list(projectId),
    enabled: projectId > 0,
  });

  const {
    data: cost,
    isLoading: costLoading,
    isError: costError,
  } = useQuery({
    queryKey: ["cost", projectId],
    queryFn: () => calculationsApi.cost(projectId),
    enabled: projectId > 0 && activeTab === "calculations",
  });

  const {
    data: profitability,
    isLoading: profitabilityLoading,
    isError: profitabilityError,
  } = useQuery({
    queryKey: ["profitability", projectId],
    queryFn: () => calculationsApi.profitability(projectId),
    enabled: projectId > 0 && activeTab === "calculations",
  });

  const {
    data: sprintPlanCost,
    isLoading: sprintPlanCostLoading,
  } = useQuery({
    queryKey: ["sprintPlanCost", projectId],
    queryFn: () => calculationsApi.sprintPlanCost(projectId),
    enabled: projectId > 0 && activeTab === "calculations",
  });

  const {
    data: sprint,
    isLoading: sprintLoading,
    isError: sprintError,
  } = useQuery({
    queryKey: ["sprint", projectId],
    queryFn: () => calculationsApi.sprint(projectId),
    enabled: projectId > 0,
  });

  const {
    data: reverseMargin,
    isLoading: reverseMarginLoading,
    isError: reverseMarginError,
  } = useQuery({
    queryKey: ["reverseMargin", projectId, reverseMarginTarget],
    queryFn: () => calculationsApi.reverseMargin(projectId, reverseMarginTarget),
    enabled: projectId > 0 && activeTab === "calculations" && reverseMarginTarget >= 0 && reverseMarginTarget <= 100,
  });

  const { data: sprintPlanApiData } = useQuery({
    queryKey: ["sprintPlan", projectId],
    queryFn: () => sprintPlanApi.get(projectId),
    enabled: projectId > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: buRates = [] } = useQuery({
    queryKey: ["buRates"],
    queryFn: () => buRatesApi.list(),
  });

  const saveSprintPlanMutation = useMutation({
    mutationFn: (data: { rows: SprintPlanningRow[]; roles: string[] }) =>
      sprintPlanApi.save(projectId, {
        rows: data.rows.map((r) => ({
          id: r.id,
          type: r.type,
          sprint_num: r.sprintNum,
          week_num: r.weekNum,
          phase: r.phase,
          values: r.values,
        })),
        roles: data.roles,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["sprintPlan", projectId], saved);
      queryClient.invalidateQueries({ queryKey: ["sprintPlanCost", projectId] });
    },
  });

  useEffect(() => {
    sprintPlanInitializedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (!project || sprintPlanInitializedRef.current) return;
    if (!sprintPlanApiData) return;
    if (sprintPlanApiData.rows.length === 0) {
      const teamRoles = team?.map((m) => m.role) ?? [];
      if (teamRoles.length === 0) {
        setSprintPlan(null);
        sprintPlanInitializedRef.current = true;
        return;
      }
      if (sprintLoading) return;
      sprintPlanInitializedRef.current = true;
      const numSprints = Math.max(CONFIG.minSprints, sprint?.sprints_required ?? CONFIG.minSprints);
      const defaultRoles = buRates.map((r) => (r.role || "").trim()).filter(Boolean);
      const { rows, roles } = createInitialSprintPlanning(
        team ?? [],
        project.sprint_duration_weeks ?? CONFIG.defaultSprintDurationWeeks,
        numSprints,
        defaultRoles
      );
      setSprintPlan({ rows, roles });
      queryClient.setQueryData(["sprintPlan", projectId], { rows: rows.map(toApiRow), roles });
      if (!(version?.is_locked ?? false)) {
        saveSprintPlanMutation.mutate({ rows, roles });
      }
      return;
    }
    sprintPlanInitializedRef.current = true;
    const apiRows = sprintPlanApiData.rows.map(fromApiRow);
    const roleCapacity = computeRoleCapacity(team ?? []);
    const migrated = migrateToSprintFormat(apiRows, sprintPlanApiData.roles, roleCapacity);
    const hasSprintRows = migrated.some((r) => r.type === "sprint" || r.type === "sprint-week");
    if (!hasSprintRows) {
      const teamRoles = team?.map((m) => m.role) ?? [];
      if (teamRoles.length === 0) {
        setSprintPlan(null);
        return;
      }
      if (sprintLoading) return;
      const numSprints = Math.max(CONFIG.minSprints, sprint?.sprints_required ?? CONFIG.minSprints);
      const defaultRoles = buRates.map((r) => (r.role || "").trim()).filter(Boolean);
      const { rows, roles } = createInitialSprintPlanning(
        team ?? [],
        project.sprint_duration_weeks ?? CONFIG.defaultSprintDurationWeeks,
        numSprints,
        defaultRoles
      );
      setSprintPlan({ rows, roles });
      queryClient.setQueryData(["sprintPlan", projectId], { rows: rows.map(toApiRow), roles });
      if (!(version?.is_locked ?? false)) {
        saveSprintPlanMutation.mutate({ rows, roles });
      }
      return;
    }
    const sorted = ensurePhasesAtEnd(migrated);
    const needsMigration = apiRows.some((r) => r.type === "sprint-week" && r.weekNum != null);
    setSprintPlan({ rows: sorted, roles: sprintPlanApiData.roles });
    if (needsMigration && !(version?.is_locked ?? false)) {
      queryClient.setQueryData(["sprintPlan", projectId], { rows: sorted.map(toApiRow), roles: sprintPlanApiData.roles });
      saveSprintPlanMutation.mutate({ rows: sorted, roles: sprintPlanApiData.roles });
    }
  }, [project, sprintPlanApiData, team, sprint?.sprints_required, sprintLoading, version?.is_locked, buRates, projectId, queryClient, saveSprintPlanMutation]);

  const deleteProjectMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repository"] });
      navigate("/repository");
    },
  });

  const calcLoading = costLoading || profitabilityLoading || sprintLoading || sprintPlanCostLoading;
  const calcError = costError || profitabilityError || sprintError;

  const addMemberMutation = useMutation({
    mutationFn: (data: TeamMemberCreate) => teamApi.add(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintPlan", projectId] });
      sprintPlanInitializedRef.current = false;
      setShowAddMember(false);
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TeamMemberCreate> }) =>
      teamApi.update(projectId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintPlan", projectId] });
      sprintPlanInitializedRef.current = false;
      setEditingMember(null);
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (memberId: number) => teamApi.delete(projectId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintPlan", projectId] });
      sprintPlanInitializedRef.current = false;
    },
  });

  const addFeatureMutation = useMutation({
    mutationFn: (data: FeatureCreate) => featuresApi.add(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["features", projectId] });
      setShowAddFeature(false);
    },
  });

  const transitionMutation = useMutation({
    mutationFn: (targetStatus: string) => versionsApi.transitionStatus(projectId, version!.id, targetStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["version", projectId] });
    },
  });
  const lockMutation = useMutation({
    mutationFn: () => versionsApi.lock(projectId, version!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["version", projectId] }),
  });

  const unlockMutation = useMutation({
    mutationFn: (reason: string) => versionsApi.unlock(projectId, version!.id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["version", projectId] }),
  });


  const debouncedSaveSprintPlan = useCallback(
    (data: { rows: SprintPlanningRow[]; roles: string[] }) => {
      if (saveSprintPlanTimeoutRef.current) {
        clearTimeout(saveSprintPlanTimeoutRef.current);
      }
      saveSprintPlanTimeoutRef.current = setTimeout(() => {
        saveSprintPlanMutation.mutate(data);
        saveSprintPlanTimeoutRef.current = null;
      }, 400);
    },
    [saveSprintPlanMutation]
  );

  const debouncedPersistFeatures = useCallback(
    (newFeatures: FeatureCreateWithId[]) => {
      if (saveFeaturesTimeoutRef.current) clearTimeout(saveFeaturesTimeoutRef.current);
      saveFeaturesTimeoutRef.current = setTimeout(async () => {
        saveFeaturesTimeoutRef.current = null;
        const current = features ?? [];
        const currentIds = new Set(current.map((f) => f.id));
        const newIds = new Set(newFeatures.filter((f) => f.id != null).map((f) => f.id!));
        for (const cf of current) {
          if (!newIds.has(cf.id)) {
            await featuresApi.delete(projectId, cf.id);
          }
        }
        for (const nf of newFeatures) {
          if (nf.id != null) {
            await featuresApi.update(projectId, nf.id, nf);
          } else {
            await featuresApi.add(projectId, nf);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["features", projectId] });
      }, 600);
    },
    [features, projectId, queryClient]
  );

  useEffect(() => {
    return () => {
      if (saveSprintPlanTimeoutRef.current) clearTimeout(saveSprintPlanTimeoutRef.current);
      if (saveFeaturesTimeoutRef.current) clearTimeout(saveFeaturesTimeoutRef.current);
    };
  }, []);

  if (!project) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">Loading project...</Typography>
      </Box>
    );
  }

  const isLocked = version?.is_locked ?? false;
  const status = (version?.status ?? "draft").toLowerCase();
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const canTransition = !isLocked && (hasRole("admin") || hasRole("delivery_manager") || hasRole("business_analyst"));
  const allowedTransitions = STATUS_TRANSITIONS[status] ?? [];

  const currency = project.currency || "USD";

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        sx={{ mb: 2, color: "text.secondary", "&:hover": { bgcolor: "action.hover" } }}
      >
        Back
      </Button>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight={600} sx={{ letterSpacing: "-0.02em" }}>
              {project.name}
            </Typography>
            {project.client_name && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {project.client_name}
              </Typography>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
              <Chip
                label={`v${version?.version_number}`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
              <Chip
                label={statusLabel}
                size="small"
                color={status === "won" || isLocked ? "success" : status === "submitted" ? "info" : "default"}
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
              {isLocked && canUnlock && (
                <Button
                  size="small"
                  startIcon={<LockOpenIcon />}
                  onClick={() => {
                    const r = prompt("Unlock reason (required):");
                    if (r) unlockMutation.mutate(r);
                  }}
                  variant="outlined"
                  color="error"
                >
                  Unlock
                </Button>
              )}
              {!isLocked &&
                allowedTransitions.map((target) => {
                  const showWon = target === "won" && canLock;
                  const showOther = target !== "won" && canTransition;
                  if (!showWon && !showOther) return null;
                  const label =
                    target === "won"
                      ? "Mark as Won"
                      : target === "draft"
                        ? "Back to Draft"
                        : target === "review"
                          ? "Back to Review"
                          : `Move to ${target.charAt(0).toUpperCase() + target.slice(1)}`;
                  return (
                    <Button
                      key={target}
                      size="small"
                      variant="outlined"
                      color={target === "won" ? "success" : undefined}
                      startIcon={target === "won" ? <LockIcon /> : undefined}
                      onClick={() =>
                        target === "won" ? lockMutation.mutate() : transitionMutation.mutate(target)
                      }
                      disabled={lockMutation.isPending || transitionMutation.isPending}
                    >
                      {label}
                    </Button>
                  );
                })}
              {!isLocked && canDeleteProject && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => {
                    if (window.confirm("Delete this project? All related data will be permanently removed.")) {
                      deleteProjectMutation.mutate();
                    }
                  }}
                  disabled={deleteProjectMutation.isPending}
                >
                  Delete Project
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </Paper>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 2,
          "& .MuiTab-root": { textTransform: "none", fontWeight: 600, minHeight: 48 },
          "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0" },
        }}
      >
        <Tab label="Features" value="features" />
        <Tab label="Team" value="team" />
        <Tab label="Sprint Plan" value="sprint" />
        <Tab label="Calculations" value="calculations" />
      </Tabs>

      {activeTab === "team" && (
        <Box>
          {canEditTeam && !isLocked && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setShowAddMember(true)} size="medium">
                Add Team Member
              </Button>
              {(!team || team.length === 0) && features && features.length > 0 && (
                <AddFromFeatureRolesButton
                  projectId={projectId}
                  features={features}
                  onAdded={() => {
                    queryClient.invalidateQueries({ queryKey: ["team", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["sprintPlan", projectId] });
                  }}
                />
              )}
              {features && features.length > 0 && (
                <Button variant="contained" startIcon={<SmartToyIcon />} onClick={() => setShowAiTeamSuggest(true)} sx={{ bgcolor: "#5856d6", "&:hover": { bgcolor: "#4846c6" } }}>
                  AI Suggest Team
                </Button>
              )}
            </Box>
          )}
          {showAiTeamSuggest && features && features.length > 0 && (
            <AiTeamSuggestCard
              projectId={projectId}
              features={features}
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: ["team", projectId] });
                setShowAiTeamSuggest(false);
              }}
              onCancel={() => setShowAiTeamSuggest(false)}
            />
          )}
          <AddMemberDialog
            open={showAddMember}
            onClose={() => setShowAddMember(false)}
            onSubmit={(d) => addMemberMutation.mutate(d)}
            isPending={addMemberMutation.isPending}
          />
          <EditMemberDialog
            open={editingMember != null}
            member={editingMember}
            onClose={() => setEditingMember(null)}
            onSubmit={(data) => editingMember && updateMemberMutation.mutate({ id: editingMember.id, data })}
            isPending={updateMemberMutation.isPending}
          />
          {team && team.length > 0 ? (
            <TableContainer component={Paper} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
              <Table size="medium">
                <TableHead>
                  <TableRow sx={{ bgcolor: "action.hover" }}>
                    <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Cost /day</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Billing /day</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Utilization</TableCell>
                    {canEditTeam && !isLocked && <TableCell sx={{ width: 100 }} />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {team.map((m) => (
                    <TableRow key={m.id} hover>
                      <TableCell>{m.role}</TableCell>
                      <TableCell>{m.member_name || "-"}</TableCell>
                      <TableCell align="right">{m.cost_rate_per_day != null ? m.cost_rate_per_day.toLocaleString() : "—"}</TableCell>
                      <TableCell align="right">{m.billing_rate_per_day != null ? m.billing_rate_per_day.toLocaleString() : "—"}</TableCell>
                      <TableCell align="right">{m.utilization_pct}%</TableCell>
                      {canEditTeam && !isLocked && (
                        <TableCell>
                          <IconButton size="small" onClick={() => setEditingMember(m)} title="Edit">
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => deleteMemberMutation.mutate(m.id)} title="Delete">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Paper sx={{ p: 6, textAlign: "center", border: "2px dashed", borderColor: "divider", borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>No team members yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Add team members to calculate project cost and capacity.</Typography>
              {canEditTeam && !isLocked && (
                <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setShowAddMember(true)}>Add team member</Button>
              )}
            </Paper>
          )}
        </Box>
      )}

      {activeTab === "features" && (
        <Box>
          {canEditFeatures && !isLocked && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowAddFeature(true)}>Add Feature</Button>
              <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => setShowAiUpload(true)} sx={{ bgcolor: "#5856d6", "&:hover": { bgcolor: "#4846c6" } }}>
                Upload Doc / AI Suggest
              </Button>
            </Box>
          )}
          {showAiUpload && project && version && (
            <AiUploadAndSuggest
              projectId={projectId}
              project={project}
              version={version}
              team={team ?? []}
              onFeaturesAdded={() => {
                queryClient.invalidateQueries({ queryKey: ["features", projectId] });
                setShowAiUpload(false);
              }}
              onCancel={() => setShowAiUpload(false)}
            />
          )}
          <AddFeatureDialog
            open={showAddFeature}
            projectId={projectId}
            onClose={() => setShowAddFeature(false)}
            onSubmit={(d) => addFeatureMutation.mutate(d)}
            isPending={addFeatureMutation.isPending}
          />
          {features && features.length > 0 ? (
            <Box sx={{ mb: 2, width: "100%", minWidth: 0 }}>
              <FeaturesTasksGrid
                features={features.map(featureToCreateWithId)}
                onChange={(newFeatures) => {
                  if (canEditFeatures && !isLocked) debouncedPersistFeatures(newFeatures);
                }}
                project={project}
                version={version}
                team={team ?? []}
                onContingencyChange={(pct) => {
                  versionsApi.update(projectId, version!.id, { contingency_pct: pct }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["version", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["cost", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["profitability", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["sprint", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["reverseMargin", projectId] });
                  });
                }}
                readOnly={isLocked || !canEditFeatures}
                minHeight={320}
                autoHeight
              />
            </Box>
          ) : (
            <Paper sx={{ p: 6, textAlign: "center", border: "2px dashed", borderColor: "divider", borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>No features yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Add features or use Upload Doc to import from a requirement document.</Typography>
              {canEditFeatures && !isLocked && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowAddFeature(true)}>Add feature</Button>
              )}
            </Paper>
          )}
        </Box>
      )}

      {activeTab === "sprint" && (
        <Box>
          {sprintPlan ? (
            <SprintPlanningGrid
              rows={sprintPlan.rows}
              roles={sprintPlan.roles}
              sprintDurationWeeks={project.sprint_duration_weeks ?? CONFIG.defaultSprintDurationWeeks}
              isLocked={isLocked}
              roleCapacity={computeRoleCapacity(team ?? [])}
              onRowsChange={(rows) => {
                if (isLocked) return;
                const sorted = ensurePhasesAtEnd(rows);
                const next = { rows: sorted, roles: sprintPlan.roles };
                setSprintPlan(next);
                debouncedSaveSprintPlan(next);
              }}
              onRolesChange={undefined}
            />
          ) : (
            <Paper sx={{ p: 6, textAlign: "center", border: "2px dashed", borderColor: "divider", borderRadius: 2 }}>
              <Typography color="text.secondary">
                {sprintPlanApiData ? "Add team members first to configure sprint allocation" : "Loading sprint plan..."}
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {activeTab === "calculations" && (
        <Box>
          {calcError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load calculations. Add team members and features first, then try again.
            </Alert>
          )}
          {calcLoading && !calcError ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent>
                    <Skeleton variant="text" width="60%" height={28} />
                    <Skeleton variant="text" width="80%" sx={{ mt: 1 }} />
                    <Skeleton variant="text" width="70%" sx={{ mt: 0.5 }} />
                    <Skeleton variant="text" width="50%" height={36} sx={{ mt: 2 }} />
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
                {cost && (
                  <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Typography variant="overline" color="text.secondary" fontWeight={600}>
                        Cost Breakdown
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>Base: {formatCurrency(Number(cost.base_cost), currency)}</Typography>
                      <Typography variant="body2">Buffer: {formatCurrency(Number(cost.risk_buffer), currency)}</Typography>
                      <Typography variant="h6" fontWeight={600} sx={{ mt: 2 }}>
                        {formatCurrency(Number(cost.total_cost), currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        Contingency {Number(cost.contingency_pct)}% + Reserve {Number(cost.management_reserve_pct)}%
                      </Typography>
                    </CardContent>
                  </Card>
                )}
                {profitability && (
                  <Card
                    sx={{
                      border: "1px solid",
                      borderColor: profitability.margin_below_threshold ? "warning.main" : "divider",
                      bgcolor: profitability.margin_below_threshold ? alpha("#ff9500", 0.06) : undefined,
                    }}
                  >
                    <CardContent>
                      <Typography variant="overline" color="text.secondary" fontWeight={600}>
                        Profitability
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>Revenue: {formatCurrency(Number(profitability.revenue), currency)}</Typography>
                      <Typography variant="body2">Cost: {formatCurrency(Number(profitability.cost), currency)}</Typography>
                      <Typography
                        variant="h6"
                        fontWeight={600}
                        color={profitability.margin_below_threshold ? "warning.main" : "success.main"}
                        sx={{ mt: 2 }}
                      >
                        {profitability.gross_margin_pct != null ? `${Number(profitability.gross_margin_pct).toFixed(1)}%` : "-"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        {profitability.margin_below_threshold ? "Below 15% — review recommended" : "Gross margin"}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
                {sprintPlanCost && (
                  <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Typography variant="overline" color="text.secondary" fontWeight={600}>
                        Cost (from FTE)
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>Base: {formatCurrency(Number(sprintPlanCost.base_cost), currency)}</Typography>
                      <Typography variant="body2">Buffer: {formatCurrency(Number(sprintPlanCost.risk_buffer), currency)}</Typography>
                      <Typography variant="h6" fontWeight={600} sx={{ mt: 2 }}>
                        {formatCurrency(Number(sprintPlanCost.total_cost), currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        From sprint plan allocation × rates
                      </Typography>
                    </CardContent>
                  </Card>
                )}
                {sprint && (
                  <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Typography variant="overline" color="text.secondary" fontWeight={600}>
                        Sprint Allocation
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>Capacity: {Number(sprint.sprint_capacity_hours).toFixed(0)} hrs/sprint</Typography>
                      <Typography variant="body2">Effort: {Number(sprint.total_effort_hours).toFixed(0)} hrs</Typography>
                      <Typography variant="h6" fontWeight={600} sx={{ mt: 2 }}>
                        {sprint.sprints_required} sprints
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        To deliver all features at current capacity
                      </Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>
              <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>Reverse Margin Calculator</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Enter target margin % to see required revenue.
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    <TextField
                      type="number"
                      label="Target margin %"
                      value={reverseMarginTarget}
                      onChange={(e) => setReverseMarginTarget(Number(e.target.value) || 0)}
                      size="small"
                      inputProps={{ min: 0, max: 100, step: 1 }}
                      sx={{ width: 160 }}
                    />
                    {reverseMarginLoading && <Typography variant="body2" color="text.secondary">Calculating...</Typography>}
                    {reverseMarginError && <Typography variant="body2" color="error">Invalid target</Typography>}
                    {reverseMargin && !reverseMarginError && (
                      <>
                        <Box>
                          <Typography variant="body2" color="text.secondary">Required revenue</Typography>
                          <Typography variant="h6" fontWeight={600}>
                            {formatCurrency(Number(reverseMargin.required_revenue), currency)}
                          </Typography>
                        </Box>
                        {reverseMargin.required_billing_rate != null && (
                          <Box>
                            <Typography variant="body2" color="text.secondary">Required billing /day</Typography>
                            <Typography variant="h6" fontWeight={600}>
                              {formatCurrency(Number(reverseMargin.required_billing_rate), currency)}
                            </Typography>
                          </Box>
                        )}
                      </>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

function AiUploadAndSuggest({
  projectId,
  project,
  version,
  team,
  onFeaturesAdded,
  onCancel,
}: {
  projectId: number;
  project: Project;
  version: ProjectVersion;
  team: TeamMember[];
  onFeaturesAdded: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"upload" | "review" | "team">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [, setAiFeatures] = useState<FeatureCreate[]>([]);
  const [editedFeatures, setEditedFeatures] = useState<FeatureCreate[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamSuggestions, setTeamSuggestions] = useState<TeamMemberCreate[] | null>(null);

  const runAiEstimate = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      let res: { features: FeatureCreate[]; raw_suggestion: string };
      if (file) {
        res = await featuresApi.aiEstimateFromUpload(projectId, file);
      } else if (pasteText.trim()) {
        res = await featuresApi.aiEstimate(projectId, pasteText.trim());
      } else {
        setAiError("Upload a file or paste requirement text");
        setAiLoading(false);
        return;
      }
      setAiFeatures(res.features);
      if (res.features.length === 0) {
        setAiError(res.raw_suggestion || "No features extracted. Try different content or paste text instead.");
        setAiLoading(false);
        return;
      }
      setEditedFeatures(res.features.map((f) => ({ ...f, effort_allocations: f.effort_allocations || [], tasks: f.tasks || [] })));
      setStep("review");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI estimate failed");
    } finally {
      setAiLoading(false);
    }
  };

  const addAllFeatures = async () => {
    for (const f of editedFeatures) {
      try {
        await featuresApi.add(projectId, f);
        queryClient.invalidateQueries({ queryKey: ["features", projectId] });
      } catch (e) {
        setAiError(e instanceof Error ? e.message : "Failed to add feature");
        return;
      }
    }
    setStep("team");
    setTeamSuggestions(null);
  };

  const suggestTeam = async () => {
    setTeamLoading(true);
    setTeamError("");
    try {
      const res = await teamApi.aiSuggest(projectId, editedFeatures.map((f) => ({
        name: f.name,
        effort_hours: typeof f.effort_hours === "number" ? f.effort_hours : Number(f.effort_hours),
        priority: f.priority ?? 1,
      })));
      setTeamSuggestions(res.members);
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "AI team suggestion failed");
    } finally {
      setTeamLoading(false);
    }
  };

  const addTeamMember = async (m: TeamMemberCreate, idx: number) => {
    try {
      await teamApi.add(projectId, m);
      queryClient.invalidateQueries({ queryKey: ["team", projectId] });
      setTeamSuggestions((prev) => prev?.filter((_, i) => i !== idx) ?? null);
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "Failed to add team member");
    }
  };

  return (
    <Card sx={{ mb: 2, width: "100%", maxWidth: "100%", border: "1px solid", borderColor: "divider" }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Upload Requirement Doc / AI Suggest</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload a PDF, DOCX, or TXT file, or paste requirement text. AI will extract features and estimate effort. Human-in-loop: review, edit, then add.
        </Typography>

        {step === "upload" && (
          <>
            <DocumentUploadZone
              file={file}
              onFileChange={(f) => {
                setFile(f);
                if (f) setPasteText("");
              }}
            />
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Or paste requirement text"
              placeholder="Paste ToR, SOW, user stories..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              sx={{ mb: 2 }}
            />
            {aiError && <Alert severity="error" sx={{ mb: 2 }}>{aiError}</Alert>}
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="contained" onClick={runAiEstimate} disabled={aiLoading || (!file && !pasteText.trim())}>
                {aiLoading ? "Analyzing..." : "Generate Features"}
              </Button>
              <Button onClick={onCancel}>Cancel</Button>
            </Box>
          </>
        )}

        {step === "review" && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Review and edit. Tasks are grouped under features. Click feature name to rename, click cells to edit. Add task/feature, delete selected, then &quot;Add All&quot; to save.</Typography>
            {teamError && <Alert severity="error" sx={{ mb: 2 }}>{teamError}</Alert>}
            <Box sx={{ mb: 2, width: "100%", minWidth: 0 }}>
              <FeaturesTasksGrid
                features={editedFeatures}
                onChange={setEditedFeatures}
                project={project}
                version={version}
                team={team}
                onContingencyChange={(pct) => {
                  versionsApi.update(projectId, version.id, { contingency_pct: pct }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["version", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["cost", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["profitability", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["sprint", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["reverseMargin", projectId] });
                  });
                }}
                minHeight={320}
                autoHeight
              />
            </Box>
            {teamSuggestions && teamSuggestions.length > 0 && (
              <Alert severity="success" sx={{ mb: 2 }}>
                <strong>Preview: Suggested team size</strong> — {teamSuggestions.length} members: {teamSuggestions.map((m) => m.role).join(", ")}
              </Alert>
            )}
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 2 }}>
              <Button variant="contained" onClick={addAllFeatures}>Add All ({editedFeatures.length})</Button>
              <Button variant="outlined" onClick={suggestTeam} disabled={teamLoading}>{teamLoading ? "Suggesting..." : "Preview Team"}</Button>
              <Button onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={onCancel}>Cancel</Button>
            </Box>
          </>
        )}

        {step === "team" && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Features added. Get AI-suggested team allocation (realistic size). Add/modify as needed.</Typography>
            {teamError && <Alert severity="error" sx={{ mb: 2 }}>{teamError}</Alert>}
            {teamSuggestions && teamSuggestions.length > 0 ? (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>Suggested team:</Typography>
                {teamSuggestions.map((m, i) => (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <Typography variant="body2">{m.role} — {m.cost_rate_per_day ?? "—"}/day cost, {m.billing_rate_per_day ?? "—"}/day billing, {m.utilization_pct}% util</Typography>
                    <Button size="small" onClick={() => addTeamMember(m, i)}>Add</Button>
                  </Box>
                ))}
              </Box>
            ) : (
              <Button variant="contained" onClick={suggestTeam} disabled={teamLoading} sx={{ mb: 2 }}>
                {teamLoading ? "Suggesting..." : "Suggest Team Allocation"}
              </Button>
            )}
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="contained" onClick={onFeaturesAdded}>Done</Button>
              <Button onClick={suggestTeam} disabled={teamLoading || (teamSuggestions?.length === 0)}>
                {teamSuggestions?.length ? "Re-suggest Team" : "Suggest Team"}
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AiTeamSuggestCard({
  projectId,
  features,
  onDone,
  onCancel,
}: {
  projectId: number;
  features: { name: string; effort_hours: number; priority?: number }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<TeamMemberCreate[] | null>(null);
  const queryClient = useQueryClient();

  const runSuggest = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await teamApi.aiSuggest(projectId, features.map((f) => ({
        name: f.name,
        effort_hours: typeof f.effort_hours === "number" ? f.effort_hours : Number(f.effort_hours),
        priority: f.priority ?? 1,
      })));
      setSuggestions(res.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI team suggestion failed");
    } finally {
      setLoading(false);
    }
  };

  const addMember = async (m: TeamMemberCreate, idx: number) => {
    try {
      await teamApi.add(projectId, m);
      queryClient.invalidateQueries({ queryKey: ["team", projectId] });
      setSuggestions((prev) => prev?.filter((_, i) => i !== idx) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    }
  };

  const totalHrs = features.reduce((s, f) => s + (typeof f.effort_hours === "number" ? f.effort_hours : Number(f.effort_hours)), 0);

  return (
    <Card sx={{ mb: 2, maxWidth: 560 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>AI Suggest Team</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Based on {features.length} features ({totalHrs} hrs total). Add suggested members or modify as needed.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!suggestions ? (
          <Button variant="contained" onClick={runSuggest} disabled={loading}>
            {loading ? "Suggesting..." : "Suggest Team"}
          </Button>
        ) : (
          <Box sx={{ mb: 2 }}>
            {suggestions.map((m, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <Typography variant="body2">{m.role} — {m.cost_rate_per_day ?? "—"}/day cost, {m.billing_rate_per_day ?? "—"}/day billing, {m.utilization_pct}% util</Typography>
                <Button size="small" onClick={() => addMember(m, i)}>Add</Button>
              </Box>
            ))}
          </Box>
        )}
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <Button onClick={onDone}>Done</Button>
          <Button onClick={onCancel}>Cancel</Button>
        </Box>
      </CardContent>
    </Card>
  );
}

function DocumentUploadZone({
  file,
  onFileChange,
}: {
  file: File | null;
  onFileChange: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const accept = ".pdf,.docx,.txt";
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && /\.(pdf|docx|txt)$/i.test(f.name)) onFileChange(f);
  };
  return (
    <Box
      sx={{
        mb: 2,
        p: 3,
        border: "2px dashed",
        borderColor: dragOver ? "primary.main" : "divider",
        borderRadius: 2,
        bgcolor: dragOver ? "action.hover" : "action.selected",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.2s",
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          onFileChange(f || null);
          e.target.value = "";
        }}
      />
      <UploadFileIcon sx={{ fontSize: 40, color: "action.active", mb: 1 }} />
      <Typography variant="body2" color="text.secondary">
        {file ? file.name : "Drop PDF, DOCX, or TXT here — or click to browse"}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        Supported: PDF, DOCX, TXT (not .doc)
      </Typography>
      {file && (
        <Button size="small" onClick={(e) => { e.stopPropagation(); onFileChange(null); }} sx={{ mt: 1 }}>
          Clear
        </Button>
      )}
    </Box>
  );
}

function AddFromFeatureRolesButton({
  projectId,
  features,
  onAdded,
}: {
  projectId: number;
  features: Feature[];
  onAdded: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { data: buRates = [] } = useQuery({ queryKey: ["buRates"], queryFn: () => buRatesApi.list() });
  const buByRole = useMemo(
    () => Object.fromEntries(buRates.map((r) => [(r.role || "").trim(), r]).filter(([k]) => k)),
    [buRates]
  );
  const rolesFromFeatures = useMemo(() => {
    const roles = new Set<string>();
    for (const f of features) {
      if (f.tasks) for (const t of f.tasks) if ((t.role || "").trim()) roles.add((t.role || "").trim());
      if (f.effort_allocations)
        for (const a of f.effort_allocations) if ((a.role || "").trim()) roles.add((a.role || "").trim());
    }
    return [...roles].sort();
  }, [features]);
  const handleAdd = async () => {
    if (rolesFromFeatures.length === 0) return;
    setLoading(true);
    try {
      for (const role of rolesFromFeatures) {
        const bu = buByRole[role] ?? Object.values(buByRole).find((r) => r.role.toLowerCase() === role.toLowerCase());
        await teamApi.add(projectId, {
          role,
          member_name: undefined,
          cost_rate_per_day: bu?.cost_rate_per_day,
          billing_rate_per_day: bu?.billing_rate_per_day,
          utilization_pct: CONFIG.fullTimeUtilizationPct,
          working_days_per_month: CONFIG.defaultWorkingDaysPerMonth,
          hours_per_day: CONFIG.defaultHoursPerDay,
        });
      }
      onAdded();
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button
      variant="outlined"
      onClick={handleAdd}
      disabled={loading || rolesFromFeatures.length === 0}
      sx={{ borderStyle: "dashed" }}
    >
      {loading ? "Adding..." : `Add team from feature roles (${rolesFromFeatures.length})`}
    </Button>
  );
}

function AddMemberDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: TeamMemberCreate) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<TeamMemberCreate>({
    role: "",
    member_name: "",
    cost_rate_per_day: undefined,
    billing_rate_per_day: undefined,
    utilization_pct: CONFIG.fullTimeUtilizationPct,
    working_days_per_month: CONFIG.defaultWorkingDaysPerMonth,
    hours_per_day: CONFIG.defaultHoursPerDay,
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  useEffect(() => {
    if (!open) setForm({ role: "", member_name: "", cost_rate_per_day: undefined, billing_rate_per_day: undefined, utilization_pct: CONFIG.fullTimeUtilizationPct, working_days_per_month: CONFIG.defaultWorkingDaysPerMonth, hours_per_day: CONFIG.defaultHoursPerDay });
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle>Add Team Member</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, pt: 1 }}>
            <TextField
              label="Role"
              required
              placeholder="e.g. Senior Developer"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              helperText="Job title or role"
            />
            <TextField
              label="Name"
              placeholder="Optional, can update later"
              value={form.member_name || ""}
              onChange={(e) => setForm({ ...form, member_name: e.target.value })}
            />
            <TextField
              label="Cost /day (optional)"
              type="number"
              inputProps={{ min: 0, step: 10 }}
              placeholder="Uses BU default if empty"
              value={form.cost_rate_per_day ?? ""}
              onChange={(e) => setForm({ ...form, cost_rate_per_day: e.target.value ? Number(e.target.value) : undefined })}
              helperText="Cost to company per day"
            />
            <TextField
              label="Billing /day (optional)"
              type="number"
              inputProps={{ min: 0, step: 10 }}
              placeholder="Uses BU default if empty"
              value={form.billing_rate_per_day ?? ""}
              onChange={(e) => setForm({ ...form, billing_rate_per_day: e.target.value ? Number(e.target.value) : undefined })}
              helperText="Rate to client per day"
            />
            <TextField
              label="Utilization %"
              type="number"
              inputProps={{ min: 1, max: 100 }}
              value={form.utilization_pct ?? ""}
              onChange={(e) => setForm({ ...form, utilization_pct: Number(e.target.value) })}
              helperText="100% = full-time on project"
            />
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="Days/month"
                type="number"
                size="small"
                inputProps={{ min: 1, max: 31 }}
                value={form.working_days_per_month ?? ""}
                onChange={(e) => setForm({ ...form, working_days_per_month: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Hrs/day"
                type="number"
                size="small"
                inputProps={{ min: 1, max: 24 }}
                value={form.hours_per_day ?? ""}
                onChange={(e) => setForm({ ...form, hours_per_day: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isPending || !form.role.trim()}>
            {isPending ? "Adding..." : "Add Member"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EditMemberDialog({
  open,
  member,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  member: TeamMember | null;
  onClose: () => void;
  onSubmit: (d: Partial<TeamMemberCreate>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<Partial<TeamMemberCreate>>({});
  useEffect(() => {
    if (member) {
      setForm({
        role: member.role,
        member_name: member.member_name ?? "",
        cost_rate_per_day: member.cost_rate_per_day,
        billing_rate_per_day: member.billing_rate_per_day,
        utilization_pct: member.utilization_pct,
        working_days_per_month: member.working_days_per_month,
        hours_per_day: member.hours_per_day,
      });
    }
  }, [member]);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<TeamMemberCreate> = {
      role: (form.role ?? "").trim() || undefined,
      member_name: (form.member_name ?? "").trim(),
      cost_rate_per_day: form.cost_rate_per_day != null && form.cost_rate_per_day !== "" ? Number(form.cost_rate_per_day) : undefined,
      billing_rate_per_day: form.billing_rate_per_day != null && form.billing_rate_per_day !== "" ? Number(form.billing_rate_per_day) : undefined,
      utilization_pct: form.utilization_pct != null && form.utilization_pct !== "" ? Number(form.utilization_pct) : undefined,
      working_days_per_month: form.working_days_per_month != null && form.working_days_per_month !== "" ? Number(form.working_days_per_month) : undefined,
      hours_per_day: form.hours_per_day != null && form.hours_per_day !== "" ? Number(form.hours_per_day) : undefined,
    };
    Object.keys(payload).forEach((k) => (payload as Record<string, unknown>)[k] === undefined && delete (payload as Record<string, unknown>)[k]);
    onSubmit(payload);
  };
  if (!member) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle>Edit Team Member</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, pt: 1 }}>
            <TextField
              label="Role"
              required
              value={form.role ?? ""}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            />
            <TextField
              label="Name"
              placeholder="Optional"
              value={form.member_name ?? ""}
              onChange={(e) => setForm({ ...form, member_name: e.target.value })}
            />
            <TextField
              label="Cost /day"
              type="number"
              inputProps={{ min: 0, step: 10 }}
              value={form.cost_rate_per_day ?? ""}
              onChange={(e) => setForm({ ...form, cost_rate_per_day: e.target.value ? Number(e.target.value) : undefined })}
            />
            <TextField
              label="Billing /day"
              type="number"
              inputProps={{ min: 0, step: 10 }}
              value={form.billing_rate_per_day ?? ""}
              onChange={(e) => setForm({ ...form, billing_rate_per_day: e.target.value ? Number(e.target.value) : undefined })}
            />
            <TextField
              label="Utilization %"
              type="number"
              inputProps={{ min: 1, max: 100 }}
              value={form.utilization_pct ?? ""}
              onChange={(e) => setForm({ ...form, utilization_pct: Number(e.target.value) })}
            />
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="Days/month"
                type="number"
                size="small"
                inputProps={{ min: 1, max: 31 }}
                value={form.working_days_per_month ?? ""}
                onChange={(e) => setForm({ ...form, working_days_per_month: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Hrs/day"
                type="number"
                size="small"
                inputProps={{ min: 1, max: 24 }}
                value={form.hours_per_day ?? ""}
                onChange={(e) => setForm({ ...form, hours_per_day: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isPending || !(form.role ?? "").trim()}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function AddFeatureDialog({
  open,
  projectId,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  projectId: number;
  onClose: () => void;
  onSubmit: (d: FeatureCreate) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<FeatureCreate>({
    name: "",
    effort_hours: 0,
    priority: 1,
  });
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<FeatureCreate[] | null>(null);

  const runAiEstimate = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiSuggestions(null);
    try {
      const res = await featuresApi.aiEstimate(projectId, aiText.trim());
      setAiSuggestions(res.features);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI estimate failed");
    } finally {
      setAiLoading(false);
    }
  };

  const useSuggestion = (f: FeatureCreate) => {
    setForm({ name: f.name, effort_hours: f.effort_hours, priority: f.priority ?? 1, description: f.description });
    setAiSuggestions(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  useEffect(() => {
    if (!open) {
      setForm({ name: "", effort_hours: 0, priority: 1 });
      setAiText("");
      setAiSuggestions(null);
      setAiError("");
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle>Add Feature</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Feature name"
              required
              fullWidth
              placeholder="e.g. User authentication with SSO"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Effort (hours)"
                type="number"
                required
                inputProps={{ min: 0, step: 0.5 }}
                placeholder="e.g. 40"
                value={form.effort_hours || ""}
                onChange={(e) => setForm({ ...form, effort_hours: Number(e.target.value) })}
                helperText="40 ≈ 1 week"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Priority"
                type="number"
                inputProps={{ min: 1 }}
                value={form.priority ?? 1}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                sx={{ width: 100 }}
              />
            </Box>
            <Box>
              <TextField
                label="AI Estimate (optional)"
                multiline
                rows={2}
                fullWidth
                placeholder="Paste requirements for AI suggestions..."
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                size="small"
              />
              <Box sx={{ display: "flex", gap: 1, mt: 1, alignItems: "center" }}>
                <Button variant="outlined" size="small" onClick={runAiEstimate} disabled={aiLoading || !aiText.trim()}>
                  {aiLoading ? "Analyzing..." : "Suggest"}
                </Button>
                {aiError && <Typography color="error" variant="caption">{aiError}</Typography>}
              </Box>
              {aiSuggestions && aiSuggestions.length > 0 && (
                <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, bgcolor: "action.hover" }}>
                  {aiSuggestions.map((f, i) => (
                    <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography variant="body2">{f.name} — {f.effort_hours} hrs</Typography>
                      <Button size="small" onClick={() => useSuggestion(f)}>Use</Button>
                    </Box>
                  ))}
                </Paper>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isPending || !form.name}>
            {isPending ? "Adding..." : "Add Feature"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
