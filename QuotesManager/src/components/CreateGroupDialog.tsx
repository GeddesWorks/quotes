import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useState } from "react";

interface CreateGroupDialogProps {
    open: boolean;
    onClose: () => void;
    onCreate: (name: string) => Promise<void>;
}

const CreateGroupDialog: React.FC<CreateGroupDialogProps> = ({ open, onClose, onCreate }) => {
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        if (!name.trim()) {
            return;
        }
        setLoading(true);
        try {
            await onCreate(name.trim());
            setName("");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Create a new group</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    margin="dense"
                    label="Group name"
                    fullWidth
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                <Button onClick={handleCreate} variant="contained" disabled={loading}>
                    Create group
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CreateGroupDialog;
