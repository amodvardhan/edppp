import {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  IconButton,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { CONFIG } from "../config";

export interface SprintPlanningRow {
  id: string;
  type: "sprint-week" | "sprint" | "phase";
  sprintNum?: number;
  weekNum?: number;
  phase?: "pre_uat" | "uat" | "go_live";
  values: Record<string, number>;
}

/** Week range label for sprint N: W1-W2, W3-W4, etc. */
function sprintWeekRange(sprintNum: number, sprintDurationWeeks: number): string {
  const start = (sprintNum - 1) * sprintDurationWeeks + 1;
  const end = sprintNum * sprintDurationWeeks;
  return `W${start}-W${end}`;
}

const PHASE_LABELS: Record<string, string> = {
  pre_uat: "Pre UAT",
  uat: "UAT",
  go_live: "Go Live",
};

function createEmptyValues(roles: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of roles) out[r] = 0;
  return out;
}

const PHASE_ORDER = ["pre_uat", "uat", "go_live"] as const;

/** Ensures Pre UAT, UAT, Go Live rows are always at the end. Deduplicates phases. */
export function ensurePhasesAtEnd(rows: SprintPlanningRow[]): SprintPlanningRow[] {
  const sprintRows = rows.filter((r) => r.type === "sprint-week" || r.type === "sprint");
  const phaseRows = rows.filter((r) => r.type === "phase");
  const phaseByType = new Map<string, SprintPlanningRow>();
  for (const r of phaseRows) {
    const key = r.phase ?? "unknown";
    if (!phaseByType.has(key)) phaseByType.set(key, r);
  }
  const sortedPhases = PHASE_ORDER
    .filter((p) => phaseByType.has(p))
    .map((p) => phaseByType.get(p)!);
  return [...sprintRows, ...sortedPhases];
}

/** Merges old format (multiple rows per sprint) into new format (one row per sprint). Deduplicates phases. */
export function migrateToSprintFormat(
  rows: SprintPlanningRow[],
  roles: string[],
  roleCapacity?: Record<string, number>
): SprintPlanningRow[] {
  const sprintRows = rows.filter((r) => r.type === "sprint-week" || r.type === "sprint");
  const phaseRows = rows.filter((r) => r.type === "phase");
  const phaseByType = new Map<string, SprintPlanningRow>();
  for (const r of phaseRows) {
    const key = r.phase ?? "unknown";
    if (!phaseByType.has(key)) phaseByType.set(key, r);
  }
  const dedupedPhases = PHASE_ORDER
    .filter((p) => phaseByType.has(p))
    .map((p) => {
      const row = phaseByType.get(p)!;
      const values: Record<string, number> = {};
      for (const role of roles) {
        values[role] = row.values[role] ?? 0;
      }
      const allZero = roles.every((role) => (values[role] ?? 0) === 0);
      if (allZero && roleCapacity) {
        for (const role of roles) {
          values[role] = roleCapacity[role] ?? 0;
        }
      }
      return { ...row, values };
    });
  const bySprint = new Map<number, SprintPlanningRow[]>();
  for (const r of sprintRows) {
    const n = r.sprintNum ?? 0;
    if (n > 0) {
      const arr = bySprint.get(n) ?? [];
      arr.push(r);
      bySprint.set(n, arr);
    }
  }
  const merged: SprintPlanningRow[] = [];
  for (const [sprintNum, weekRows] of [...bySprint.entries()].sort((a, b) => a[0] - b[0])) {
    const first = weekRows[0];
    const values: Record<string, number> = {};
    for (const role of roles) {
      values[role] = first.values[role] ?? 0;
    }
    const allZero = roles.every((role) => (values[role] ?? 0) === 0);
    if (allZero && roleCapacity) {
      for (const role of roles) {
        values[role] = roleCapacity[role] ?? 0;
      }
    }
    merged.push({
      id: `s${sprintNum}`,
      type: "sprint",
      sprintNum,
      weekNum: undefined,
      values,
    });
  }
  return [...merged, ...dedupedPhases];
}

function parseAllocation(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatAllocation(n: number): string {
  if (n === 0) return "";
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

interface EditableCellProps {
  value: number;
  role: string;
  rowId: string;
  disabled?: boolean;
  onChange: (rowId: string, role: string, value: number) => void;
}

const EditableCell = memo(function EditableCell({
  value,
  role,
  rowId,
  disabled,
  onChange,
}: EditableCellProps) {
  const [local, setLocal] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cellKey = `${rowId}:${role}`;

  useEffect(() => {
    if (!focused) {
      setLocal(formatAllocation(value));
    }
  }, [value, focused]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    setLocal(value > 0 ? String(value) : "");
    requestAnimationFrame(() => inputRef.current?.select());
  }, [value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const parsed = parseAllocation(local);
    if (parsed !== value) {
      onChange(rowId, role, parsed);
    }
    setLocal(formatAllocation(parsed));
  }, [local, value, rowId, role, onChange]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocal(e.target.value);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        inputRef.current?.blur();
      }
    },
    []
  );

  if (disabled) {
    return (
      <TableCell align="center" sx={{ py: 0.5, px: 1 }}>
        {formatAllocation(value) || "—"}
      </TableCell>
    );
  }

  if (focused) {
    return (
      <TableCell align="center" sx={{ py: 0, px: 0.5 }}>
        <TextField
          inputRef={inputRef}
          size="small"
          value={local}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          inputProps={{
            "data-cell": cellKey,
            min: 0,
            step: 0.25,
            style: { textAlign: "center", padding: "6px 8px" },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              "& fieldset": { borderColor: "primary.main" },
            },
          }}
        />
      </TableCell>
    );
  }

  return (
    <TableCell
      align="center"
      sx={{
        py: 0.5,
        px: 1,
        minWidth: 72,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
      onClick={handleFocus}
    >
      {formatAllocation(value) || "0"}
    </TableCell>
  );
});

export interface SprintPlanningGridProps {
  rows: SprintPlanningRow[];
  roles: string[];
  sprintDurationWeeks?: number;
  isLocked?: boolean;
  /** Role capacity for pre-filling new sprints (100%=1, 50%=0.5, etc.) */
  roleCapacity?: Record<string, number>;
  onRowsChange: (rows: SprintPlanningRow[]) => void;
  onRolesChange?: (roles: string[]) => void;
}

function computeRowTotal(values: Record<string, number>): number {
  let sum = 0;
  for (const v of Object.values(values)) sum += v;
  return sum;
}

function computeColumnTotal(rows: SprintPlanningRow[], role: string): number {
  let sum = 0;
  for (const r of rows) sum += r.values[role] ?? 0;
  return sum;
}

export default function SprintPlanningGrid({
  rows,
  roles,
  sprintDurationWeeks = CONFIG.defaultSprintDurationWeeks,
  isLocked = false,
  roleCapacity = {},
  onRowsChange,
  onRolesChange,
}: SprintPlanningGridProps) {
  const handleCellChange = useCallback(
    (rowId: string, role: string, value: number) => {
      onRowsChange(
        rows.map((r) =>
          r.id === rowId
            ? { ...r, values: { ...r.values, [role]: value } }
            : r
        )
      );
    },
    [rows, onRowsChange]
  );

  const addSprint = useCallback(() => {
    const maxSprint = rows.reduce((m, r) => {
      if ((r.type === "sprint-week" || r.type === "sprint") && r.sprintNum != null) {
        return Math.max(m, r.sprintNum);
      }
      return m;
    }, 0);
    const newSprintNum = maxSprint + 1;
    const values: Record<string, number> = {};
    for (const role of roles) {
      values[role] = roleCapacity[role] ?? 0;
    }
    const newRows: SprintPlanningRow[] = [{
      id: `s${newSprintNum}`,
      type: "sprint",
      sprintNum: newSprintNum,
      weekNum: undefined,
      values,
    }];
    const phaseStart = rows.findIndex((r) => r.type === "phase");
    if (phaseStart >= 0) {
      const before = rows.slice(0, phaseStart);
      const after = rows.slice(phaseStart);
      onRowsChange([...before, ...newRows, ...after]);
    } else {
      onRowsChange([...rows, ...newRows]);
    }
  }, [rows, roles, sprintDurationWeeks, roleCapacity, onRowsChange]);

  const removeLastSprint = useCallback(() => {
    const sprintRows = rows.filter((r) => r.type === "sprint-week" || r.type === "sprint");
    if (sprintRows.length < 1) return;
    const maxSprint = Math.max(
      ...sprintRows.map((r) => r.sprintNum ?? 0),
      0
    );
    if (maxSprint < 1) return;
    const toRemove = sprintRows
      .filter((r) => r.sprintNum === maxSprint)
      .map((r) => r.id);
    onRowsChange(rows.filter((r) => !toRemove.includes(r.id)));
  }, [rows, onRowsChange]);

  const addRole = useCallback(() => {
    const name = prompt("Role name:");
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (roles.includes(trimmed)) return;
    const newRoles = [...roles, trimmed];
    onRolesChange?.(newRoles);
    const emptyVal = createEmptyValues([trimmed]);
    onRowsChange(
      rows.map((r) => ({
        ...r,
        values: { ...r.values, ...emptyVal },
      }))
    );
  }, [roles, rows, onRolesChange, onRolesChange]);

  const removeRole = useCallback(
    (role: string) => {
      if (roles.length <= 1) return;
      const newRoles = roles.filter((r) => r !== role);
      onRolesChange?.(newRoles);
      onRowsChange(
        rows.map((r) => {
          const { [role]: _, ...rest } = r.values;
          return { ...r, values: rest };
        })
      );
    },
    [roles, rows, onRowsChange, onRolesChange]
  );

  const rowTotals = useMemo(
    () => new Map(rows.map((r) => [r.id, computeRowTotal(r.values)])),
    [rows]
  );

  const columnTotals = useMemo(
    () =>
      Object.fromEntries(roles.map((r) => [r, computeColumnTotal(rows, r)])),
    [rows, roles]
  );

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + computeRowTotal(r.values), 0),
    [rows]
  );

  const sprintWeeks = useMemo(() => {
    const bySprint = new Map<number, SprintPlanningRow[]>();
    for (const r of rows) {
      if ((r.type === "sprint-week" || r.type === "sprint") && r.sprintNum != null) {
        const arr = bySprint.get(r.sprintNum) ?? [];
        arr.push(r);
        bySprint.set(r.sprintNum, arr);
      }
    }
    return bySprint;
  }, [rows]);

  const sprintTotals = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [sprintNum, weekRows] of sprintWeeks) {
      out[sprintNum] = weekRows.reduce(
        (s, r) => s + computeRowTotal(r.values),
        0
      );
    }
    return out;
  }, [sprintWeeks]);

  const canRemoveSprint =
    rows.filter((r) => r.type === "sprint-week" || r.type === "sprint").length > 1;

  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Sprint Allocation Plan
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            1 = 100% · 0.5 = 50% · 0.25 = 25% · 0 = no allocation
          </Typography>
        </Box>
        {!isLocked && (
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <IconButton
              size="small"
              onClick={addSprint}
              title="Add sprint"
              color="primary"
            >
              <AddIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={removeLastSprint}
              disabled={!canRemoveSprint}
              title="Remove last sprint"
              color="error"
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
            {onRolesChange && (
              <IconButton
                size="small"
                onClick={addRole}
                title="Add role column"
                color="primary"
              >
                <AddIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        )}
      </Box>

      <TableContainer
        component={Paper}
        sx={{
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          overflow: "auto",
        }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow sx={{ bgcolor: "action.hover" }}>
              <TableCell
                sx={{
                  fontWeight: 600,
                  minWidth: 140,
                  borderRight: "1px solid",
                  borderColor: "divider",
                }}
              >
                Sprint / Phase
              </TableCell>
              {roles.map((role) => (
                <TableCell
                  key={role}
                  align="center"
                  sx={{
                    fontWeight: 600,
                    minWidth: 72,
                    borderRight: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.5,
                    }}
                  >
                    {role}
                    {!isLocked && onRolesChange && roles.length > 1 && (
                      <IconButton
                        size="small"
                        sx={{ p: 0.25 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRole(role);
                        }}
                        title={`Remove ${role}`}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                </TableCell>
              ))}
              <TableCell
                align="center"
                sx={{
                  fontWeight: 600,
                  minWidth: 64,
                  bgcolor: "action.selected",
                }}
              >
                Total
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const label =
                r.type === "sprint" || r.type === "sprint-week"
                  ? r.type === "sprint"
                    ? `Sprint ${r.sprintNum}   ${sprintWeekRange(r.sprintNum ?? 0, sprintDurationWeeks)}`
                    : r.weekNum === 1
                      ? `Sprint ${r.sprintNum}`
                      : `Week ${r.weekNum}`
                  : r.phase
                    ? PHASE_LABELS[r.phase] ?? r.phase
                    : "";
              const isSprintHeader = r.type === "sprint" || (r.type === "sprint-week" && r.weekNum === 1);
              return (
                <TableRow key={r.id} hover>
                  <TableCell
                    sx={{
                      fontWeight: isSprintHeader ? 600 : 400,
                      borderRight: "1px solid",
                      borderColor: "divider",
                      pl: isSprintHeader ? 2 : 4,
                    }}
                  >
                    {label}
                  </TableCell>
                  {roles.map((role) => (
                    <EditableCell
                      key={role}
                      value={r.values[role] ?? 0}
                      role={role}
                      rowId={r.id}
                      disabled={isLocked}
                      onChange={handleCellChange}
                    />
                  ))}
                  <TableCell
                    align="center"
                    sx={{
                      fontWeight: 500,
                      bgcolor: "action.selected",
                    }}
                  >
                    {formatAllocation(rowTotals.get(r.id) ?? 0) || "0"}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow sx={{ bgcolor: "action.hover" }}>
              <TableCell
                sx={{
                  fontWeight: 600,
                  borderRight: "1px solid",
                  borderColor: "divider",
                }}
              >
                Total
              </TableCell>
              {roles.map((role) => (
                <TableCell
                  key={role}
                  align="center"
                  sx={{
                    fontWeight: 600,
                    borderRight: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  {formatAllocation(columnTotals[role] ?? 0) || "0"}
                </TableCell>
              ))}
              <TableCell
                align="center"
                sx={{ fontWeight: 600, bgcolor: "action.selected" }}
              >
                {formatAllocation(grandTotal) || "0"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

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
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Summary
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            mt: 1,
            fontSize: "0.875rem",
          }}
        >
          <Box>
            <Typography variant="body2" color="text.secondary">
              Total FTE-weeks
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {grandTotal.toFixed(2)}
            </Typography>
          </Box>
          {Object.entries(sprintTotals).map(([sprintNum, total]) => (
            <Box key={sprintNum}>
              <Typography variant="body2" color="text.secondary">
                Sprint {sprintNum} total
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {total.toFixed(2)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Sprint planning flow:
 * 1. Total effort (from features + contingency)
 * 2. Sprint weeks (from project.sprint_duration_weeks, set at project creation)
 * 3. Total sprints = ceil(total_effort / sprint_capacity) — from calculations API
 * 4. Table generated with one row per sprint, cells pre-filled by role capacity
 */

/** Role capacity: 100% -> 1, 50% -> 0.5, 25% -> 0.25, 0% -> 0. Sum for multiple members with same role. */
const PERCENT_TO_CAPACITY = 100;

export function computeRoleCapacity(
  team: { role: string; utilization_pct?: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of team) {
    const role = (m.role || "").trim();
    if (!role) continue;
    const cap = (m.utilization_pct ?? 0) / PERCENT_TO_CAPACITY;
    out[role] = (out[role] ?? 0) + cap;
  }
  return out;
}

export function createInitialSprintPlanning(
  team: { role: string; utilization_pct?: number }[],
  _sprintDurationWeeks: number,
  numSprints: number,
  defaultRoles: string[] = []
): { rows: SprintPlanningRow[]; roles: string[] } {
  const teamRoles = team.map((m) => (m.role || "").trim()).filter(Boolean);
  const roles =
    teamRoles.length > 0 ? [...new Set(teamRoles)] : defaultRoles;
  const roleCapacity = computeRoleCapacity(team);
  const phaseValues: Record<string, number> = {};
  for (const role of roles) {
    phaseValues[role] = roleCapacity[role] ?? 0;
  }

  const rows: SprintPlanningRow[] = [];

  for (let s = 1; s <= numSprints; s++) {
    const values: Record<string, number> = {};
    for (const role of roles) {
      values[role] = roleCapacity[role] ?? 0;
    }
    rows.push({
      id: `s${s}`,
      type: "sprint",
      sprintNum: s,
      weekNum: undefined,
      values,
    });
  }

  rows.push(
    {
      id: "pre_uat",
      type: "phase",
      phase: "pre_uat",
      values: { ...phaseValues },
    },
    {
      id: "uat",
      type: "phase",
      phase: "uat",
      values: { ...phaseValues },
    },
    {
      id: "go_live",
      type: "phase",
      phase: "go_live",
      values: { ...phaseValues },
    }
  );

  return { rows, roles };
}
