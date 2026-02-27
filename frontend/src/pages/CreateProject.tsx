import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  MenuItem,
  Button,
  Alert,
  FormHelperText,
  Stepper,
  Step,
  StepLabel,
  Stack,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { CONFIG } from "../config";
import { projectsApi } from "../lib/api";

const steps = ["Basic info", "Revenue & timeline", "Review"];

export default function CreateProject() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    client_name: "",
    revenue_model: "fixed" as "fixed" | "t_m" | "milestone",
    currency: "USD",
    sprint_duration_weeks: CONFIG.defaultSprintDurationWeeks,
    fixed_revenue: undefined as number | undefined,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      projectsApi.create({
        ...form,
        fixed_revenue: form.revenue_model === "fixed" ? form.fixed_revenue : undefined,
      }),
    onSuccess: (data) => {
      navigate(`/projects/${data.project_id}`);
    },
  });

  const canProceed = () => {
    if (activeStep === 0) return form.name.trim().length > 0;
    if (activeStep === 1) return true;
    return true;
  };

  const handleNext = () => {
    if (activeStep < steps.length - 1) setActiveStep((s) => s + 1);
    else createMutation.mutate();
  };

  const handleBack = () => setActiveStep((s) => Math.max(0, s - 1));

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} sx={{ mb: 1 }}>
        Create Project
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Set up a new delivery project. You can add team members and features after creation.
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Card>
        <CardContent sx={{ p: 3 }}>
          {activeStep === 0 && (
            <Stack spacing={2.5} maxWidth={480}>
              <TextField
                label="Project Name"
                required
                placeholder="e.g. Client Portal Phase 2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
              <TextField
                label="Client Name"
                placeholder="Optional"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              />
            </Stack>
          )}

          {activeStep === 1 && (
            <Stack spacing={2.5} maxWidth={480}>
              <TextField
                select
                label="Revenue Model"
                value={form.revenue_model}
                onChange={(e) =>
                  setForm({
                    ...form,
                    revenue_model: e.target.value as "fixed" | "t_m" | "milestone",
                  })
                }
              >
                <MenuItem value="fixed">Fixed Price</MenuItem>
                <MenuItem value="t_m">Time & Materials</MenuItem>
                <MenuItem value="milestone">Milestone</MenuItem>
              </TextField>
              <FormHelperText sx={{ mt: -1 }}>
                Fixed: One upfront price. T&M: Bill by effort. Milestone: Payment at milestones.
              </FormHelperText>
              <TextField
                select
                label="Currency"
                required
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="EUR">EUR</MenuItem>
                <MenuItem value="INR">INR</MenuItem>
              </TextField>
              <TextField
                label="Sprint Duration (weeks)"
                type="number"
                inputProps={{ min: 1, max: 4 }}
                value={form.sprint_duration_weeks}
                onChange={(e) =>
                  setForm({ ...form, sprint_duration_weeks: parseInt(e.target.value, 10) })
                }
                helperText="Length of each sprint (2 weeks typical for agile)"
              />
              {form.revenue_model === "fixed" && (
                <TextField
                  label="Fixed Revenue (optional)"
                  type="number"
                  placeholder="e.g. 80000"
                  value={form.fixed_revenue ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fixed_revenue: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  helperText="Add later once proposal is finalized. Used for margin calculation."
                />
              )}
            </Stack>
          )}

          {activeStep === 2 && (
            <Stack spacing={1.5} maxWidth={480}>
              <Typography variant="subtitle2" color="text.secondary">
                Project
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {form.name || "—"}
              </Typography>
              {form.client_name && (
                <Typography variant="body2" color="text.secondary">
                  Client: {form.client_name}
                </Typography>
              )}
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                Revenue
              </Typography>
              <Typography variant="body1">
                {form.revenue_model} · {form.currency}
                {form.revenue_model === "fixed" && form.fixed_revenue != null && (
                  <> · {form.fixed_revenue.toLocaleString()}</>
                )}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                Timeline
              </Typography>
              <Typography variant="body1">
                {form.sprint_duration_weeks} week sprints
              </Typography>
            </Stack>
          )}

          {createMutation.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {createMutation.error.message}
            </Alert>
          )}

          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<ArrowBackIcon />}
            >
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={!canProceed() || createMutation.isPending}
              endIcon={activeStep === steps.length - 1 ? undefined : <ArrowForwardIcon />}
            >
              {createMutation.isPending
                ? "Creating..."
                : activeStep === steps.length - 1
                  ? "Create Project"
                  : "Next"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
