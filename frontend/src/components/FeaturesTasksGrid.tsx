import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TreeDataGrid, SelectColumn, type Column, type RenderEditCellProps, type RenderGroupCellProps } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { Box, Button, IconButton, TextField, Typography, useTheme } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { buRatesApi, type FeatureCreate, type FeatureTask, type Project, type ProjectVersion, type TeamMember } from "../lib/api";

export interface GridRow {
  id: number;
  feature: string;
  task: string;
  hours: number;
  /** AI-suggested role (displayed in column) */
  aiSuggestedRole: string;
  /** BU role user selected (for billing rate & cost calculation) */
  role: string;
  priority: number;
}

function featuresToRows(features: FeatureCreate[], buRoleNames: string[]): GridRow[] {
  let id = 0;
  const rows: GridRow[] = [];
  const roleMatchesBu = (r: string) =>
    r?.trim() && buRoleNames.some((bu) => bu.toLowerCase() === r.trim().toLowerCase());
  for (const f of features) {
    const priority = f.priority ?? 1;
    const tasks = f.tasks && f.tasks.length > 0 ? f.tasks : [{ name: f.name, effort_hours: f.effort_hours, role: "" }];
    for (const t of tasks) {
      const taskRole = String(t.role ?? "").trim();
      const aiSuggested = taskRole || "";
      const selectedBuRole = buRoleNames.length > 0 && roleMatchesBu(taskRole) ? taskRole : "";
      rows.push({
        id: ++id,
        feature: f.name,
        task: t.name,
        hours: t.effort_hours,
        aiSuggestedRole: aiSuggested,
        role: selectedBuRole,
        priority,
      });
    }
  }
  return rows;
}

function rowsToFeatures(rows: GridRow[]): FeatureCreate[] {
  const byFeature = new Map<string, GridRow[]>();
  for (const r of rows) {
    const key = r.feature.trim() || "(Unnamed)";
    if (!byFeature.has(key)) byFeature.set(key, []);
    byFeature.get(key)!.push(r);
  }
  const features: FeatureCreate[] = [];
  for (const [name, taskRows] of byFeature) {
    const tasks: FeatureTask[] = taskRows
      .filter((r: GridRow) => String(r.task || "").trim())
      .map((r: GridRow) => ({
        name: r.task,
        effort_hours: Number(r.hours) || 0,
        role: String(r.role || r.aiSuggestedRole || "").trim(),
      }));
    const effort_hours = taskRows.reduce((s: number, r: GridRow) => s + (Number(r.hours) || 0), 0);
    const priority = Number(taskRows[0]?.priority) || 1;
    features.push({ name, effort_hours, priority, tasks: tasks.length > 0 ? tasks : undefined });
  }
  return features;
}

function rowGrouper(rows: readonly GridRow[], columnKey: string): Record<string, readonly GridRow[]> {
  const map: Record<string, GridRow[]> = {};
  for (const r of rows) {
    const key = String(r[columnKey as keyof GridRow] ?? "").trim() || "(Unnamed)";
    if (!map[key]) map[key] = [];
    map[key].push({ ...r });
  }
  return map;
}

/** Case-insensitive lookup: "Developer" matches "developer", "QA Engineer" matches "qa engineer". */
function getRateForRole(role: string, rates: Record<string, number>): number {
  if (!role?.trim()) return 0;
  const r = role.trim();
  if (rates[r] != null && rates[r] > 0) return rates[r];
  const lower = r.toLowerCase();
  const entry = Object.entries(rates).find(([k]) => k.toLowerCase() === lower);
  return entry ? entry[1] : 0;
}

/** Base rate per day: ONLY BU billing rates (Billing/Day). Grid must not use team/AI suggestions. */
function getBuRatesForGrid(buRates: { role: string; billing_rate_per_day: number }[]): Record<string, number> {
  return Object.fromEntries(buRates.map((r) => [r.role, r.billing_rate_per_day]));
}

function computeSprintCapacity(team: TeamMember[], sprintWeeks: number): number {
  const workingDaysPerMonth = 20;
  const daysInSprint = (workingDaysPerMonth * sprintWeeks) / 2;
  let total = 0;
  for (const m of team) {
    const hours = (m.hours_per_day ?? 8) * daysInSprint * ((m.utilization_pct ?? 80) / 100);
    total += hours;
  }
  return total;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface FeaturesTasksGridProps {
  features: FeatureCreate[];
  onChange: (features: FeatureCreate[]) => void;
  project?: Project;
  version?: ProjectVersion;
  team?: TeamMember[];
  onContingencyChange?: (pct: number) => void;
  minHeight?: number;
  autoHeight?: boolean;
}

export default function FeaturesTasksGrid({
  features,
  onChange,
  project,
  version,
  team = [],
  onContingencyChange,
  minHeight = 280,
  autoHeight = true,
}: FeaturesTasksGridProps) {
  const theme = useTheme();
  const [rows, setRows] = useState<GridRow[]>(() => featuresToRows(features, []));
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<number | string>>(() => new Set<number | string>());
  const [expandedGroupIds, setExpandedGroupIds] = useState<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    for (const r of featuresToRows(features, [])) {
      const key = r.feature.trim() || "(Unnamed)";
      ids.add(key);
    }
    return ids;
  });
  const [contingencyPct, setContingencyPct] = useState(() => (version != null ? Number(version.contingency_pct) || 15 : 15));
  useEffect(() => {
    if (version != null) setContingencyPct(Number(version.contingency_pct) || 15);
  }, [version?.contingency_pct]);

  const currency = project?.currency ?? "USD";
  const { data: buRates = [], isLoading: buRatesLoading } = useQuery({
    queryKey: ["buRates"],
    queryFn: () => buRatesApi.list(),
  });
  const buRoleNames = useMemo(() => buRates.map((r) => r.role), [buRates]);

  useEffect(() => {
    const newRows = featuresToRows(features, buRoleNames);
    setRows((prev) => {
      if (prev.length !== newRows.length) return newRows;
      const same = prev.every(
        (p, i) =>
          newRows[i] &&
          p.id === newRows[i].id &&
          p.feature === newRows[i].feature &&
          p.task === newRows[i].task &&
          p.hours === newRows[i].hours &&
          p.priority === newRows[i].priority &&
          p.role === newRows[i].role &&
          p.aiSuggestedRole === newRows[i].aiSuggestedRole
      );
      return same ? prev : newRows;
    });
  }, [features, buRoleNames]);
  const baseRatePerDay = useMemo(() => getBuRatesForGrid(buRates), [buRates]);
  const sprintWeeks = project?.sprint_duration_weeks ?? 2;

  const syncToFeatures = useCallback(
    (newRows: GridRow[]) => {
      setRows(newRows);
      onChange(rowsToFeatures(newRows));
    },
    [onChange]
  );

  const handleRowsChange = useCallback(
    (newRows: GridRow[]) => {
      syncToFeatures(newRows);
    },
    [syncToFeatures]
  );

  const handleFeatureRename = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim() || "(Unnamed)";
      if (trimmed === (oldName.trim() || "(Unnamed)")) return;
      const newRows = rows.map((r) =>
        (r.feature.trim() || "(Unnamed)") === (oldName.trim() || "(Unnamed)") ? { ...r, feature: trimmed } : r
      );
      syncToFeatures(newRows);
    },
    [rows, syncToFeatures]
  );

  const nextId = useMemo(() => Math.max(0, ...rows.map((r) => r.id)) + 1, [rows]);

  const addTask = useCallback(() => {
    const lastFeature = rows.length > 0 ? rows[rows.length - 1].feature : "";
    const newRow: GridRow = {
      id: nextId,
      feature: lastFeature,
      task: "",
      hours: 0,
      aiSuggestedRole: "",
      role: "",
      priority: 1,
    };
    const newRows = [...rows, newRow];
    syncToFeatures(newRows);
    setSelectedRows(new Set([nextId]));
  }, [rows, nextId, syncToFeatures]);

  const addFeature = useCallback(() => {
    const newRow: GridRow = {
      id: nextId,
      feature: "New feature",
      task: "",
      hours: 0,
      aiSuggestedRole: "",
      role: "",
      priority: 1,
    };
    const newRows = [...rows, newRow];
    syncToFeatures(newRows);
    setExpandedGroupIds((prev) => new Set([...prev, "New feature"]));
    setSelectedRows(new Set([nextId]));
  }, [rows, nextId, syncToFeatures]);

  const deleteSelected = useCallback(() => {
    if (selectedRows.size === 0) return;
    const newRows = rows.filter((r) => !selectedRows.has(r.id as number | string));
    syncToFeatures(newRows);
    setSelectedRows(new Set());
  }, [rows, selectedRows, syncToFeatures]);

  const RoleEditor = useCallback(
    ({ row, onRowChange, onClose }: RenderEditCellProps<GridRow>) => (
      <select
        value={row.role || ""}
        onChange={(e) => {
          const selectedBuRole = e.target.value;
          onRowChange({ ...row, role: selectedBuRole });
          onClose(true);
        }}
        onBlur={() => onClose(true)}
        autoFocus
        style={{
          width: "100%",
          height: "100%",
          padding: "0 8px",
          border: `2px solid ${theme.palette.primary.main}`,
          borderRadius: 8,
          fontSize: 14,
          background: theme.palette.background.paper,
        }}
      >
        <option value="">Select BU role</option>
        {buRoleNames.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    ),
    [theme, buRoleNames]
  );

  const NumberEditor = useCallback(({ column, row, onRowChange, onClose }: RenderEditCellProps<GridRow>) => {
    const value = row[column.key as keyof GridRow];
    const num = typeof value === "number" ? value : Number(value) || 0;
    return (
      <input
        type="number"
        value={num}
        onChange={(e) => onRowChange({ ...row, [column.key]: Number(e.target.value) || 0 })}
        onBlur={() => onClose(true)}
        onKeyDown={(e) => e.key === "Enter" && onClose(true)}
        autoFocus
        min={column.key === "priority" ? 1 : 0}
        step={column.key === "hours" ? 0.5 : 1}
        style={{ width: "100%", height: "100%", padding: "0 8px", border: `2px solid ${theme.palette.primary.main}`, borderRadius: 8, fontSize: 14 }}
      />
    );
  }, [theme]);

  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const FeatureGroupCell = useCallback(
    ({ groupKey, isExpanded, toggleGroup, tabIndex }: RenderGroupCellProps<GridRow>) => {
      const displayKey = String(groupKey);
      const isEditing = editingGroupKey === displayKey;
      return (
        <span className="rdg-group-cell-content" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span
            role="button"
            tabIndex={tabIndex}
            onClick={toggleGroup}
            onKeyDown={(e) => e.key === "Enter" && toggleGroup()}
            style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
            aria-expanded={isExpanded}
          >
            <svg viewBox="0 0 14 8" width={14} height={8} style={{ flexShrink: 0 }}>
              <path d={isExpanded ? "M1 1 L 7 7 L 13 1" : "M1 7 L 7 1 L 13 7"} fill="currentColor" />
            </svg>
          </span>
          {isEditing ? (
            <input
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={() => {
                handleFeatureRename(displayKey, editingValue);
                setEditingGroupKey(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleFeatureRename(displayKey, editingValue);
                  setEditingGroupKey(null);
                }
              }}
              autoFocus
              style={{ flex: 1, minWidth: 0, padding: "4px 8px", border: `1px solid ${theme.palette.divider}`, borderRadius: 6, fontSize: 14 }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setEditingGroupKey(displayKey);
                setEditingValue(displayKey);
              }}
              style={{ flex: 1, cursor: "text", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {displayKey}
            </span>
          )}
        </span>
      );
    },
    [handleFeatureRename, theme, editingGroupKey, editingValue]
  );

  const primaryMain = theme.palette.primary.main;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width || 1200);
    return () => ro.disconnect();
  }, []);

  const HOURS_PER_DAY = 8;

  const colWidths = useMemo(() => {
    const w = containerWidth - 44;
    return {
      feature: Math.max(180, Math.floor(w * 0.24)),
      task: Math.max(180, Math.floor(w * 0.24)),
      hours: 80,
      role: 140,
      baseRate: 95,
      cost: 95,
      priority: 80,
    };
  }, [containerWidth]);

  const roleSummary = useMemo(() => {
    const byRole: Record<string, { hours: number; cost: number }> = {};
    for (const r of rows) {
      const role = r.role.trim() || "(Unassigned)";
      const hrs = Number(r.hours) || 0;
      const ratePerDay = getRateForRole(r.role, baseRatePerDay);
      const cost = ratePerDay > 0 ? hrs * (ratePerDay / HOURS_PER_DAY) : 0;
      if (!byRole[role]) byRole[role] = { hours: 0, cost: 0 };
      byRole[role].hours += hrs;
      byRole[role].cost += cost;
    }
    return Object.entries(byRole).sort((a, b) => b[1].hours - a[1].hours);
  }, [rows, baseRatePerDay]);

  const totalEffort = useMemo(() => rows.reduce((s, r) => s + (Number(r.hours) || 0), 0), [rows]);
  const baseCost = useMemo(
    () =>
      rows.reduce((s, r) => {
        const hrs = Number(r.hours) || 0;
        const ratePerDay = getRateForRole(r.role, baseRatePerDay);
        return s + (ratePerDay > 0 ? hrs * (ratePerDay / HOURS_PER_DAY) : 0);
      }, 0),
    [rows, baseRatePerDay]
  );
  const sprintCapacity = useMemo(() => computeSprintCapacity(team, sprintWeeks), [team, sprintWeeks]);
  const sprintsRequired = sprintCapacity > 0 ? Math.ceil(totalEffort / sprintCapacity) : 0;
  const reservePct = version?.management_reserve_pct ? Number(version.management_reserve_pct) : 0;
  const totalWithBuffers = baseCost * (1 + contingencyPct / 100 + reservePct / 100);

  const columns: Column<GridRow>[] = useMemo(
    () => [
      { ...SelectColumn, width: 44, minWidth: 44 },
      {
        key: "feature",
        name: "Feature",
        minWidth: 180,
        width: colWidths.feature,
        resizable: true,
        renderGroupCell: FeatureGroupCell,
      },
      {
        key: "task",
        name: "Task",
        minWidth: 180,
        width: colWidths.task,
        editable: true,
        resizable: true,
      },
      {
        key: "hours",
        name: "Hours",
        minWidth: 70,
        width: colWidths.hours,
        editable: true,
        resizable: true,
        renderEditCell: NumberEditor,
      },
      {
        key: "role",
        name: "Role",
        minWidth: 120,
        width: colWidths.role,
        editable: true,
        resizable: true,
        renderEditCell: RoleEditor,
        renderCell: ({ row }) => {
          const ai = row.aiSuggestedRole?.trim();
          const selected = row.role?.trim();
          if (ai && selected && ai !== selected) return `${ai} → ${selected}`;
          if (ai) return ai;
          return "—";
        },
      },
      {
        key: "baseRate",
        name: "Base Rate",
        minWidth: 85,
        width: colWidths.baseRate,
        resizable: true,
        renderCell: ({ row }) => {
          const ratePerDay = getRateForRole(row.role, baseRatePerDay);
          return ratePerDay > 0 ? `${formatCurrency(ratePerDay, currency)}/d` : "—";
        },
      },
      {
        key: "cost",
        name: "Cost",
        minWidth: 85,
        width: colWidths.cost,
        resizable: true,
        renderCell: ({ row }) => {
          const hrs = Number(row.hours) || 0;
          const ratePerDay = getRateForRole(row.role, baseRatePerDay);
          const cost = ratePerDay > 0 ? hrs * (ratePerDay / HOURS_PER_DAY) : 0;
          return cost > 0 ? formatCurrency(cost, currency) : "—";
        },
      },
      {
        key: "priority",
        name: "Priority",
        minWidth: 70,
        width: colWidths.priority,
        editable: true,
        resizable: true,
        renderEditCell: NumberEditor,
      },
    ],
    [NumberEditor, RoleEditor, FeatureGroupCell, baseRatePerDay, buRoleNames, currency, colWidths]
  );

  const gridHeight = useMemo(() => {
    if (!autoHeight) return minHeight;
    const grouped = rowGrouper(rows, "feature");
    let totalH = 44;
    for (const [key, childRows] of Object.entries(grouped)) {
      totalH += 44;
      if (expandedGroupIds.has(key)) totalH += childRows.length * 40;
    }
    return Math.max(minHeight, totalH);
  }, [autoHeight, minHeight, rows, expandedGroupIds]);

  const handleContingencyBlur = useCallback(() => {
    const pct = Math.max(0, Math.min(100, contingencyPct));
    setContingencyPct(pct);
    onContingencyChange?.(pct);
  }, [contingencyPct, onContingencyChange]);

  return (
    <Box ref={containerRef} sx={{ width: "100%", minWidth: 0 }}>
      {!buRatesLoading && buRoleNames.length === 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
          Configure BU roles and rates in Settings → BU Rates first. Base Rate shows Billing/Day per role.
        </Typography>
      )}
      <Box
        sx={{
          width: "100%",
          "& .rdg": {
            "--rdg-border-color": theme.palette.divider,
            "--rdg-background-color": theme.palette.background.paper,
            "--rdg-header-background-color": theme.palette.action.hover,
            "--rdg-row-hover-background-color": theme.palette.action.hover,
            "--rdg-selection-color": primaryMain,
            "--rdg-row-selected-background-color": theme.palette.mode === "light" ? "rgba(0,113,227,0.08)" : "rgba(255,255,255,0.08)",
            "--rdg-row-selected-hover-background-color": theme.palette.mode === "light" ? "rgba(0,113,227,0.12)" : "rgba(255,255,255,0.12)",
            "--rdg-font-size": "14px",
            "--rdg-color": theme.palette.text.primary,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            fontFamily: theme.typography.fontFamily,
          },
          "& .rdg-header-row": { fontWeight: 600 },
          "& .rdg-cell": { padding: "8px 12px" },
        }}
      >
        <TreeDataGrid
          columns={columns}
          rows={rows}
          groupBy={["feature"]}
          rowGrouper={rowGrouper}
          expandedGroupIds={expandedGroupIds}
          onExpandedGroupIdsChange={(s) => setExpandedGroupIds(s as ReadonlySet<string>)}
          groupIdGetter={(key) => String(key)}
          onRowsChange={handleRowsChange}
          rowKeyGetter={(r) => ("groupKey" in r ? String((r as { id: unknown }).id) : (r as GridRow).id)}
          selectedRows={selectedRows}
          onSelectedRowsChange={(s) => setSelectedRows(s as ReadonlySet<number | string>)}
          style={{ height: gridHeight, width: "100%" }}
          rowHeight={(args) => (args.type === "GROUP" ? 44 : 40)}
          headerRowHeight={44}
          defaultColumnOptions={{ resizable: true }}
          enableVirtualization={false}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 1.5,
          px: 1,
          border: "1px solid",
          borderColor: "divider",
          borderTop: "none",
          bgcolor: "action.hover",
          borderRadius: "0 0 8px 8px",
        }}
      >
        <Button size="small" startIcon={<AddIcon />} onClick={addTask} variant="outlined">
          Add task
        </Button>
        <Button size="small" startIcon={<AddIcon />} onClick={addFeature} variant="outlined">
          Add feature
        </Button>
        <IconButton
          size="small"
          onClick={deleteSelected}
          disabled={selectedRows.size === 0}
          title="Delete selected rows"
          color="error"
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
        {selectedRows.size > 0 && (
          <Box component="span" sx={{ fontSize: "0.8125rem", color: "text.secondary", ml: 1 }}>
            {selectedRows.size} selected
          </Box>
        )}
      </Box>

      <Box
        sx={{
          mt: 2,
          p: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Summary &amp; Sprint Plan
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          <Box sx={{ minWidth: 200 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Role summary
            </Typography>
            <Box component="table" sx={{ fontSize: "0.8125rem", mt: 0.5 }}>
              <tbody>
                {roleSummary.length > 0 ? (
                  roleSummary.map(([role, { hours, cost }]) => (
                    <tr key={role}>
                      <td style={{ paddingRight: 16 }}>{role}</td>
                      <td style={{ paddingRight: 16 }}>{hours.toFixed(1)}h</td>
                      <td>{cost > 0 ? formatCurrency(cost, currency) : "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ color: theme.palette.text.secondary }}>
                      Configure BU rates (Settings) for roles. Base Rate uses BU Billing/Day.
                    </td>
                  </tr>
                )}
              </tbody>
            </Box>
          </Box>
          <Box sx={{ minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Contingency %
            </Typography>
            <TextField
              size="small"
              type="number"
              value={contingencyPct}
              onChange={(e) => setContingencyPct(Number(e.target.value) || 0)}
              onBlur={handleContingencyBlur}
              inputProps={{ min: 0, max: 100, step: 1 }}
              sx={{ width: 100, mt: 0.5 }}
            />
          </Box>
          <Box sx={{ minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Sprint plan
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              <strong>{totalEffort.toFixed(0)}h</strong> effort · <strong>{sprintCapacity.toFixed(0)}h</strong> capacity/sprint
            </Typography>
            <Typography variant="body2">
              <strong>{sprintsRequired}</strong> sprints required
            </Typography>
          </Box>
          <Box sx={{ minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Cost
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Base: {formatCurrency(baseCost, currency)}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              Total (+{contingencyPct}% contingency{reservePct > 0 ? `, +${reservePct}% reserve` : ""}): {formatCurrency(totalWithBuffers, currency)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
