import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Button,
  InputAdornment,
  Skeleton,
  Stack,
  alpha,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import FolderIcon from "@mui/icons-material/Folder";
import { repositoryApi } from "../lib/api";

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Repository() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["repository", search, status],
    queryFn: () =>
      repositoryApi.list({
        ...(search && { search }),
        ...(status && { status }),
      }),
  });

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={40} sx={{ mb: 2 }} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }, gap: 2 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rounded" height={180} />
          ))}
        </Box>
      </Box>
    );
  }

  if (error) {
    return <Typography color="error">Failed to load repository</Typography>;
  }

  const items = data?.items ?? [];

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            Project Repository
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            All your delivery projects in one place
          </Typography>
        </Box>
        <Button component={Link} to="/projects/new" variant="contained" startIcon={<AddIcon />} size="large">
          New Project
        </Button>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          placeholder="Search projects or clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          sx={{
            minWidth: 280,
            "& .MuiOutlinedInput-root": { bgcolor: "background.paper" },
          }}
        />
        <TextField
          select
          size="small"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 180, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
        >
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
          <MenuItem value="review">Review</MenuItem>
          <MenuItem value="submitted">Submitted</MenuItem>
          <MenuItem value="won">Won</MenuItem>
        </TextField>
      </Stack>

      {items.length > 0 ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          {items.map((p) => (
            <Card
              key={p.id}
              sx={{
                position: "relative",
                overflow: "hidden",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                },
              }}
            >
              <CardActionArea component={Link} to={`/projects/${p.id}`} sx={{ height: "100%", display: "block" }}>
                <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                      <FolderIcon sx={{ color: "primary.main", fontSize: 28 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={600} noWrap>
                          {p.name}
                        </Typography>
                        {p.client_name && (
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {p.client_name}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Chip
                      label={p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      size="small"
                      color={
                        p.status === "won" ? "success" : p.status === "submitted" ? "info" : "default"
                      }
                      variant="outlined"
                      sx={{ fontWeight: 500 }}
                    />
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
                    <Chip label={p.revenue_model} size="small" variant="outlined" sx={{ fontSize: "0.75rem" }} />
                    <Chip label={p.currency} size="small" variant="outlined" sx={{ fontSize: "0.75rem" }} />
                  </Box>
                  <Stack direction="row" spacing={2} sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Revenue
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {p.revenue != null ? formatCurrency(p.revenue, p.currency) : "-"}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Cost
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {p.cost != null ? formatCurrency(p.cost, p.currency) : "-"}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Margin
                      </Typography>
                      {p.margin_pct != null ? (
                        <Chip
                          label={`${p.margin_pct.toFixed(1)}%`}
                          size="small"
                          color={p.margin_pct < 15 ? "warning" : "success"}
                          sx={{
                            fontWeight: 600,
                            mt: 0.25,
                            bgcolor: p.margin_pct < 15 ? alpha("#ff9500", 0.12) : alpha("#34c759", 0.12),
                          }}
                        />
                      ) : (
                        <Typography variant="body2">
                          -
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      ) : (
        <Card
          sx={{
            p: 6,
            textAlign: "center",
            border: "2px dashed",
            borderColor: "divider",
            bgcolor: "background.default",
          }}
        >
          <FolderIcon sx={{ fontSize: 64, color: "action.disabled", mb: 2 }} />
          <Typography variant="h6" gutterBottom fontWeight={600}>
            No projects yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: "auto" }}>
            Create a project to start planning delivery, estimating effort, and tracking profitability.
          </Typography>
          <Button component={Link} to="/projects/new" variant="contained" size="large" startIcon={<AddIcon />}>
            Create project
          </Button>
        </Card>
      )}
    </Box>
  );
}
