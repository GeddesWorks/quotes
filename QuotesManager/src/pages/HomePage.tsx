import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

const HomePage = () => {
    const navigate = useNavigate();

    return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
            <Box p={3} display="flex" flexDirection="column" gap={2} width="100%" maxWidth="600px">
                <Typography variant="h4" align="center">Welcome to Quotes Manager</Typography>
                <Button variant="contained" color="primary" onClick={() => navigate("/add")}>
                    Add a Quote
                </Button>
                <Button variant="contained" color="secondary" onClick={() => navigate("/multiview")}>
                    Primary Quote View
                </Button>
                <Button variant="outlined" color="secondary" onClick={() => navigate("/view")}>
                    Quote Scroller
                </Button>
            </Box>
        </Box>
    );
};

export default HomePage;