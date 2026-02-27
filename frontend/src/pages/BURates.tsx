import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { buRatesApi, type BuRate, type BuRateCreate } from "../lib/api";

export default function BURates() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BuRateCreate>({
    role: "",
    cost_rate_per_day: 0,
    billing_rate_per_day: 0,
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["buRates"],
    queryFn: () => buRatesApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: BuRateCreate) => buRatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buRates"] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { cost_rate_per_day?: number; billing_rate_per_day?: number } }) =>
      buRatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buRates"] });
      setDialogOpen(false);
      setEditingId(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => buRatesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buRates"] }),
  });

  const resetForm = () => {
    setForm({ role: "", cost_rate_per_day: 0, billing_rate_per_day: 0 });
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (r: BuRate) => {
    setEditingId(r.id);
    setForm({
      role: r.role,
      cost_rate_per_day: r.cost_rate_per_day,
      billing_rate_per_day: r.billing_rate_per_day,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId !== null) {
      updateMutation.mutate({
        id: editingId,
        data: {
          cost_rate_per_day: form.cost_rate_per_day,
          billing_rate_per_day: form.billing_rate_per_day,
        },
      });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} sx={{ mb: 1 }}>
        BU Default Rates
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Default cost and billing rates per role at Business Unit level. Used when project team members don&apos;t override. All rates are <strong>per day</strong>.
      </Typography>

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Role rates (/day)
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
              Add role
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
            <Table size="medium">
              <TableHead>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Cost /day</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Billing /day</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
                      No default rates. Add roles to set BU-level rates used as project defaults.
                    </TableCell>
                  </TableRow>
                ) : (
                  rates.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.role}</TableCell>
                      <TableCell align="right">{r.cost_rate_per_day.toLocaleString()}</TableCell>
                      <TableCell align="right">{r.billing_rate_per_day.toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => handleOpenEdit(r)} title="Edit">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            if (window.confirm(`Delete rate for ${r.role}?`)) {
                              deleteMutation.mutate(r.id);
                            }
                          }}
                          title="Delete"
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? "Edit rate" : "Add role rate"}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              label="Role"
              fullWidth
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              disabled={editingId !== null}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Cost /day"
              type="number"
              fullWidth
              required
              inputProps={{ min: 0, step: 10 }}
              value={form.cost_rate_per_day || ""}
              onChange={(e) => setForm({ ...form, cost_rate_per_day: Number(e.target.value) || 0 })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Billing /day"
              type="number"
              fullWidth
              required
              inputProps={{ min: 0, step: 10 }}
              value={form.billing_rate_per_day || ""}
              onChange={(e) => setForm({ ...form, billing_rate_per_day: Number(e.target.value) || 0 })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Update" : "Add"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
