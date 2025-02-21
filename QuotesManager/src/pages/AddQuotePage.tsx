import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "../util/firestore";
import { TextField, Button, Box, MenuItem, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

interface User {
    id: string;
    name: string;
    quotes: string[];
}

const AddQuotePage = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState("");
    const [newUserName, setNewUserName] = useState("");
    const [quoteText, setQuoteText] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUsers = async () => {
            const querySnapshot = await getDocs(collection(db, "quotes"));
            const fetchedUsers = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                name: doc.data().name,
                quotes: doc.data().quotes || [],
            }));
            setUsers(fetchedUsers);
        };

        fetchUsers();
    }, []);

    const handleAddQuote = async () => {
        if (quoteText.trim() === "") return alert("Please enter a quote.");

        if (selectedUser) {
            // Add quote to existing user
            const userRef = doc(db, "quotes", selectedUser);
            await setDoc(
                userRef,
                {
                    quotes: [...(users.find((u) => u.id === selectedUser)?.quotes || []), quoteText],
                },
                { merge: true }
            );
        } else if (newUserName.trim() !== "") {
            // Create new user and add quote
            const newUserRef = await addDoc(collection(db, "quotes"), {
                name: newUserName,
                quotes: [quoteText],
            });
            setUsers([...users, { id: newUserRef.id, name: newUserName, quotes: [quoteText] }]);
            setNewUserName("");
        }

        setQuoteText("");
        alert("Quote added successfully!");
    };

    return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
            <Box p={3} display="flex" flexDirection="column" gap={2} width="100%" maxWidth="600px">
                <Typography variant="h5" align="center">Add a Quote</Typography>

                <TextField
                    select
                    label="Select User"
                    fullWidth
                    value={selectedUser}
                    onChange={(e) => {
                        setSelectedUser(e.target.value);
                        setNewUserName("");
                    }}
                >
                    <MenuItem value="">Create New User</MenuItem>
                    {users.map((user) => (
                        <MenuItem key={user.id} value={user.id}>
                            {user.name}
                        </MenuItem>
                    ))}
                </TextField>

                {selectedUser === "" && (
                    <TextField
                        label="New User Name"
                        fullWidth
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                    />
                )}

                <TextField
                    label="Quote"
                    multiline
                    rows={3}
                    fullWidth
                    value={quoteText}
                    onChange={(e) => setQuoteText(e.target.value)}
                />

                <Button variant="contained" color="primary" onClick={handleAddQuote}>
                    Add Quote
                </Button>

                <Button variant="outlined" color="secondary" onClick={() => navigate("/")}>
                    Go Home
                </Button>
            </Box>
        </Box>
    );
};

export default AddQuotePage;