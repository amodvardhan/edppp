const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken(): string | null {
  return localStorage.getItem("token");
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || "Request failed");
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return res.json();
}

export const buRatesApi = {
  list: () => api<BuRate[]>("/settings/bu-rates"),
  create: (data: BuRateCreate) =>
    api<BuRate>("/settings/bu-rates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: BuRateUpdate) =>
    api<BuRate>(`/settings/bu-rates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    api(`/settings/bu-rates/${id}`, { method: "DELETE" }),
};

export interface BuRate {
  id: number;
  role: string;
  cost_rate_per_day: number;
  billing_rate_per_day: number;
}

export interface BuRateCreate {
  role: string;
  cost_rate_per_day: number;
  billing_rate_per_day: number;
}

export interface BuRateUpdate {
  cost_rate_per_day?: number;
  billing_rate_per_day?: number;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (data: { email: string; password: string; full_name: string; role_ids: number[] }) =>
    api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const projectsApi = {
  create: (data: ProjectCreate) =>
    api<{ project_id: number; version_id: number }>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  get: (id: number) => api<Project>(`/projects/${id}`),
  delete: (id: number) =>
    api(`/projects/${id}`, { method: "DELETE" }),
};

export interface SprintPlanRowApi {
  id: string;
  type: "sprint-week" | "phase";
  sprint_num?: number;
  week_num?: number;
  phase?: "pre_uat" | "uat" | "go_live";
  values: Record<string, number>;
}

export interface SprintPlanApi {
  rows: SprintPlanRowApi[];
  roles: string[];
}

function toApiRow(r: { id: string; type: string; sprintNum?: number; weekNum?: number; phase?: string; values: Record<string, number> }) {
  return {
    id: r.id,
    type: r.type,
    sprint_num: r.sprintNum,
    week_num: r.weekNum,
    phase: r.phase,
    values: r.values,
  };
}

function fromApiRow(r: SprintPlanRowApi) {
  return {
    id: r.id,
    type: r.type as "sprint-week" | "phase",
    sprintNum: r.sprint_num,
    weekNum: r.week_num,
    phase: r.phase as "pre_uat" | "uat" | "go_live" | undefined,
    values: r.values,
  };
}

export const sprintPlanApi = {
  get: (projectId: number) =>
    api<SprintPlanApi>(`/projects/${projectId}/sprint-plan`),
  save: (projectId: number, data: { rows: { id: string; type: string; sprintNum?: number; weekNum?: number; phase?: string; values: Record<string, number> }[]; roles: string[] }) =>
    api<SprintPlanApi>(`/projects/${projectId}/sprint-plan`, {
      method: "PUT",
      body: JSON.stringify({
        rows: data.rows.map(toApiRow),
        roles: data.roles,
      }),
    }),
};

export { fromApiRow };

export const repositoryApi = {
  list: (params?: { search?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (params?.search) p.set("search", params.search);
    if (params?.status) p.set("status", params.status);
    const q = p.toString();
    return api<{ items: RepositoryItem[]; total: number }>(
      `/repository/projects${q ? `?${q}` : ""}`
    );
  },
  dashboard: () => api<DashboardData>("/repository/dashboard"),
};

export const calculationsApi = {
  cost: (projectId: number) => api<CostBreakdown>(`/projects/${projectId}/calculations/cost`),
  revenue: (projectId: number) => api<RevenueBreakdown>(`/projects/${projectId}/calculations/revenue`),
  profitability: (projectId: number) =>
    api<ProfitabilityBreakdown>(`/projects/${projectId}/calculations/profitability`),
  sprint: (projectId: number) => api<SprintAllocation>(`/projects/${projectId}/calculations/sprint`),
  reverseMargin: (projectId: number, targetMargin: number) =>
    api<ReverseMarginResult>(`/projects/${projectId}/calculations/reverse-margin?target_margin_pct=${targetMargin}`),
};

export const teamApi = {
  list: (projectId: number) => api<TeamMember[]>(`/projects/${projectId}/team`),
  add: (projectId: number, data: TeamMemberCreate) =>
    api<TeamMember>(`/projects/${projectId}/team`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: number, memberId: number, data: Partial<TeamMemberCreate>) =>
    api<TeamMember>(`/projects/${projectId}/team/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (projectId: number, memberId: number) =>
    api(`/projects/${projectId}/team/${memberId}`, { method: "DELETE" }),
  aiSuggest: (projectId: number, features: { name: string; effort_hours: number; priority?: number }[]) =>
    api<{ members: TeamMemberCreate[]; raw_suggestion: string }>(`/projects/${projectId}/team/ai-suggest`, {
      method: "POST",
      body: JSON.stringify({ features }),
    }),
};

export const featuresApi = {
  list: (projectId: number) => api<Feature[]>(`/projects/${projectId}/features`),
  add: (projectId: number, data: FeatureCreate) =>
    api<Feature>(`/projects/${projectId}/features`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: number, featureId: number, data: Partial<FeatureCreate>, justification?: string) => {
    const url = justification
      ? `/projects/${projectId}/features/${featureId}?justification=${encodeURIComponent(justification)}`
      : `/projects/${projectId}/features/${featureId}`;
    return api<Feature>(url, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  delete: (projectId: number, featureId: number) =>
    api(`/projects/${projectId}/features/${featureId}`, { method: "DELETE" }),
  aiEstimate: (projectId: number, text: string) =>
    api<{ features: FeatureCreate[]; raw_suggestion: string }>(`/projects/${projectId}/features/ai-estimate`, {
      method: "POST",
      body: JSON.stringify({ requirement_text: text }),
    }),
  aiEstimateFromUpload: (projectId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/projects/${projectId}/features/ai-estimate-upload`, {
      method: "POST",
      headers,
      body: formData,
    }).then(async (res) => {
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const msg = err.detail
          ? Array.isArray(err.detail)
            ? err.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
            : String(err.detail)
          : err.message || "Request failed";
        throw new Error(msg);
      }
      return res.json() as Promise<{ features: FeatureCreate[]; raw_suggestion: string }>;
    });
  },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["review"],
  review: ["submitted", "draft"],
  submitted: ["won", "review"],
  won: [],
  locked: [], // legacy; treat as won
};

export const versionsApi = {
  getCurrent: (projectId: number) =>
    api<ProjectVersion>(`/projects/${projectId}/versions/current`),
  update: (projectId: number, versionId: number, data: { contingency_pct?: number; management_reserve_pct?: number }) =>
    api(`/projects/${projectId}/versions/${versionId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  transitionStatus: (projectId: number, versionId: number, targetStatus: string) =>
    api<{ ok: boolean; status: string }>(
      `/projects/${projectId}/versions/${versionId}/status?target_status=${encodeURIComponent(targetStatus)}`,
      { method: "PATCH" }
    ),
  lock: (projectId: number, versionId: number) =>
    api(`/projects/${projectId}/versions/${versionId}/lock`, { method: "POST" }),
  unlock: (projectId: number, versionId: number, reason: string) =>
    api(`/projects/${projectId}/versions/${versionId}/unlock?reason=${encodeURIComponent(reason)}`, {
      method: "POST",
    }),
};

export { STATUS_TRANSITIONS };

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
}

export interface ProjectCreate {
  name: string;
  client_name?: string;
  revenue_model?: "fixed" | "t_m" | "milestone";
  currency: string;
  sprint_duration_weeks?: number;
  project_duration_months?: number;
  project_duration_sprints?: number;
  fixed_revenue?: number;
}

export interface Project {
  id: number;
  name: string;
  client_name?: string;
  revenue_model: string;
  currency: string;
  sprint_duration_weeks: number;
  project_duration_months?: number;
  project_duration_sprints?: number;
  fixed_revenue?: number;
  created_by: number;
  created_at: string;
}

export interface ProjectVersion {
  id: number;
  project_id: number;
  version_number: number;
  status: string;
  is_locked: boolean;
  contingency_pct: number;
  management_reserve_pct: number;
  estimation_authority?: string;
  created_at: string;
}

export interface RepositoryItem {
  id: number;
  name: string;
  client_name?: string;
  currency: string;
  revenue_model: string;
  created_by: number;
  created_at: string;
  status: string;
  revenue?: number;
  cost?: number;
  margin_pct?: number;
}

export interface DashboardData {
  total_simulated_revenue: number;
  total_simulated_cost: number;
  avg_margin_pct: number;
  project_count: number;
  projects_below_threshold: number;
  top_roles: [string, number][];
}

export interface CostBreakdown {
  base_cost: number;
  risk_buffer: number;
  total_cost: number;
  contingency_pct: number;
  management_reserve_pct: number;
}

export interface RevenueBreakdown {
  revenue: number;
  revenue_model: string;
}

export interface ProfitabilityBreakdown {
  revenue: number;
  cost: number;
  gross_margin_pct?: number;
  net_margin_pct?: number;
  margin_below_threshold: boolean;
}

export interface SprintAllocation {
  sprint_capacity_hours: number;
  total_effort_hours: number;
  sprints_required: number;
  effort_per_sprint: number;
}

export interface ReverseMarginResult {
  target_margin_pct: number;
  required_revenue: number;
  required_billing_rate?: number;
}

export interface TeamMember {
  id: number;
  version_id: number;
  role: string;
  member_name?: string;
  cost_rate_per_day?: number;
  billing_rate_per_day?: number;
  utilization_pct: number;
  working_days_per_month: number;
  hours_per_day: number;
}

export interface TeamMemberCreate {
  role: string;
  member_name?: string;
  cost_rate_per_day?: number;
  billing_rate_per_day?: number;
  utilization_pct: number;
  working_days_per_month?: number;
  hours_per_day?: number;
}

export interface FeatureTask {
  name: string;
  effort_hours: number;
  role: string;
}

export interface Feature {
  id: number;
  version_id: number;
  name: string;
  description?: string;
  priority: number;
  effort_hours: number;
  effort_story_points?: number;
  ai_suggested_effort?: number;
  ai_suggested_approved: boolean;
  effort_allocations: { id: number; role: string; allocation_pct: number; effort_hours: number }[];
  tasks?: FeatureTask[];
}

export interface FeatureCreate {
  name: string;
  description?: string;
  priority?: number;
  effort_hours: number;
  effort_story_points?: number;
  effort_allocations?: { role: string; allocation_pct: number; effort_hours: number }[];
  tasks?: FeatureTask[];
}
