import { Outlet, Link, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FolderIcon from "@mui/icons-material/Folder";
import SettingsIcon from "@mui/icons-material/Settings";
import AddIcon from "@mui/icons-material/Add";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          color: "text.primary",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ gap: 2, py: 1 }}>
          <Typography
            component={Link}
            to="/"
            variant="h6"
            sx={{
              fontWeight: 600,
              color: "inherit",
              textDecoration: "none",
              mr: 2,
            }}
          >
            EDPPP
          </Typography>
          <Button
            component={Link}
            to="/"
            startIcon={<DashboardIcon />}
            sx={{ color: "text.secondary" }}
          >
            Dashboard
          </Button>
          <Button
            component={Link}
            to="/repository"
            startIcon={<FolderIcon />}
            sx={{ color: "text.secondary" }}
          >
            Repository
          </Button>
          <Button
            component={Link}
            to="/settings/bu-rates"
            startIcon={<SettingsIcon />}
            sx={{ color: "text.secondary" }}
          >
            BU Rates
          </Button>
          <Button
            component={Link}
            to="/projects/new"
            variant="contained"
            startIcon={<AddIcon />}
            sx={{ ml: 1 }}
          >
            New Project
          </Button>
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {user?.full_name}
          </Typography>
          <IconButton onClick={handleLogout} size="small" title="Logout">
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box
        component="main"
        sx={{
          flex: 1,
          p: 3,
          width: "100%",
          minWidth: 0,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
