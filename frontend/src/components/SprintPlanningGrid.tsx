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

export interface SprintPlanningRow {
  id: string;
  type: "sprint-week" | "phase";
  sprintNum?: number;
  weekNum?: number;
  phase?: "pre_uat" | "uat" | "go_live";
  values: Record<string, number>;
}

const PHASE_LABELS: Record<string, string> = {
  pre_uat: "Pre UAT",
  uat: "UAT",
  go_live: "Go Live",
};

const FALLBACK_ROLES = ["Technical Architect", "Project Manager", "QA"];

function createEmptyValues(roles: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of roles) out[r] = 0;
  return out;
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
  sprintDurationWeeks = 2,
  isLocked = false,
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
      if (r.type === "sprint-week" && r.sprintNum != null) {
        return Math.max(m, r.sprintNum);
      }
      return m;
    }, 0);
    const newSprintNum = maxSprint + 1;
    const empty = createEmptyValues(roles);
    const newRows: SprintPlanningRow[] = [];
    for (let w = 1; w <= sprintDurationWeeks; w++) {
      newRows.push({
        id: `s${newSprintNum}w${w}`,
        type: "sprint-week",
        sprintNum: newSprintNum,
        weekNum: w,
        values: { ...empty },
      });
    }
    const phaseStart = rows.findIndex((r) => r.type === "phase");
    if (phaseStart >= 0) {
      const before = rows.slice(0, phaseStart);
      const after = rows.slice(phaseStart);
      onRowsChange([...before, ...newRows, ...after]);
    } else {
      onRowsChange([...rows, ...newRows]);
    }
  }, [rows, roles, sprintDurationWeeks, onRowsChange]);

  const removeLastSprint = useCallback(() => {
    const sprintRows = rows.filter((r) => r.type === "sprint-week");
    if (sprintRows.length < sprintDurationWeeks) return;
    const maxSprint = Math.max(
      ...sprintRows.map((r) => r.sprintNum ?? 0),
      0
    );
    if (maxSprint < 1) return;
    const toRemove = sprintRows
      .filter((r) => r.sprintNum === maxSprint)
      .map((r) => r.id);
    onRowsChange(rows.filter((r) => !toRemove.includes(r.id)));
  }, [rows, sprintDurationWeeks, onRowsChange]);

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
      if (r.type === "sprint-week" && r.sprintNum != null) {
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
    rows.filter((r) => r.type === "sprint-week").length > sprintDurationWeeks;

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
                r.type === "sprint-week"
                  ? r.weekNum === 1
                    ? `Sprint ${r.sprintNum}`
                    : `Week ${r.weekNum}`
                  : r.phase
                    ? PHASE_LABELS[r.phase] ?? r.phase
                    : "";
              const isSprintHeader = r.type === "sprint-week" && r.weekNum === 1;
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

export function createInitialSprintPlanning(
  teamRoles: string[],
  sprintDurationWeeks: number = 2,
  numSprints: number = 2
): { rows: SprintPlanningRow[]; roles: string[] } {
  const roles =
    teamRoles.length > 0 ? [...teamRoles] : [...FALLBACK_ROLES];
  const empty = createEmptyValues(roles);

  const rows: SprintPlanningRow[] = [];

  for (let s = 1; s <= numSprints; s++) {
    for (let w = 1; w <= sprintDurationWeeks; w++) {
      const values: Record<string, number> = {};
      for (const role of roles) {
        values[role] = 0;
      }
      rows.push({
        id: `s${s}w${w}`,
        type: "sprint-week",
        sprintNum: s,
        weekNum: w,
        values,
      });
    }
  }

  rows.push(
    {
      id: "pre_uat",
      type: "phase",
      phase: "pre_uat",
      values: { ...empty },
    },
    {
      id: "uat",
      type: "phase",
      phase: "uat",
      values: { ...empty },
    },
    {
      id: "go_live",
      type: "phase",
      phase: "go_live",
      values: { ...empty },
    }
  );

  return { rows, roles };
}
