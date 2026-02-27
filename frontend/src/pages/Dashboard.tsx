import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Skeleton,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import PieChartIcon from "@mui/icons-material/PieChart";
import FolderIcon from "@mui/icons-material/Folder";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { repositoryApi } from "../lib/api";

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => repositoryApi.dashboard(),
  });

  const { data: projects } = useQuery({
    queryKey: ["repository", "recent"],
    queryFn: () => repositoryApi.list({}),
  });

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={40} sx={{ mb: 3 }} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }, gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={120} />
          ))}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error">Failed to load dashboard</Typography>
    );
  }

  if (!data) return null;

  const isEmpty = data.project_count === 0;
  const recentItems = projects?.items?.slice(0, 5) ?? [];
  const hasLowMargin = data.projects_below_threshold > 0;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>
          Executive Dashboard
        </Typography>
        <Button
          component={Link}
          to="/projects/new"
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ textDecoration: "none" }}
        >
          New Project
        </Button>
      </Box>

      {isEmpty && (
        <Card sx={{ mb: 3, bgcolor: "rgba(0, 113, 227, 0.06)", border: "1px solid", borderColor: "primary.light" }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Getting started
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Create a project, add team members and features, then view cost and profitability.
            </Typography>
            <Button component={Link} to="/projects/new" variant="contained" endIcon={<ArrowForwardIcon />}>
              Create your first project
            </Button>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }, gap: 2, mb: 3 }}>
        <Box>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <TrendingUpIcon color="success" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Total Simulated Revenue
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {formatCurrency(data.total_simulated_revenue)}
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <TrendingDownIcon color="primary" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Total Simulated Cost
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {formatCurrency(data.total_simulated_cost)}
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <PieChartIcon color="primary" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Average Margin
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {data.avg_margin_pct.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <FolderIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Projects
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {data.project_count}
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box>
          <Card
            sx={{
              height: "100%",
              border: hasLowMargin ? "2px solid" : undefined,
              borderColor: hasLowMargin ? "warning.main" : undefined,
              bgcolor: hasLowMargin ? "rgba(255, 149, 0, 0.08)" : undefined,
            }}
          >
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <WarningAmberIcon color="warning" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Below 15% Margin
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600} color={hasLowMargin ? "warning.main" : "text.primary"}>
                {data.projects_below_threshold}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Recent Projects
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Latest projects in your repository
              </Typography>
              {recentItems.length > 0 ? (
                <Table size="small">
                  <TableBody>
                    {recentItems.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Typography fontWeight={500}>{p.name}</Typography>
                          {p.client_name && (
                            <Typography variant="caption" color="text.secondary">
                              {p.client_name}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {p.margin_pct != null ? (
                            <Chip
                              label={`${p.margin_pct.toFixed(1)}%`}
                              size="small"
                              color={p.margin_pct < 15 ? "warning" : "default"}
                              variant="outlined"
                            />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            component={Link}
                            to={`/projects/${p.id}`}
                            size="small"
                            endIcon={<ArrowForwardIcon />}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography color="text.secondary">No projects yet</Typography>
              )}
              <Button component={Link} to="/repository" sx={{ mt: 2 }}>
                View all projects
              </Button>
            </CardContent>
          </Card>
        </Box>
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Top Roles Used
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Most common roles across projects
              </Typography>
              {data.top_roles.length > 0 ? (
                <Table size="small">
                  <TableBody>
                    {data.top_roles.map(([role, count]) => (
                      <TableRow key={role}>
                        <TableCell>{role}</TableCell>
                        <TableCell align="right">{count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography color="text.secondary">Add team members to see roles</Typography>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
