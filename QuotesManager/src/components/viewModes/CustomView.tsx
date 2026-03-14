import { Box, Stack, Typography } from "@mui/material";
import { createElement, useMemo } from "react";
import GridLayout, {
    noCompactor,
    useContainerWidth,
    type Layout,
    type LayoutItem
} from "react-grid-layout";
import type { ViewModuleDefinition, ViewModuleProps } from "../viewModules";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

interface CustomViewProps {
    modules: ViewModuleDefinition[];
    moduleOrder: string[];
    moduleProps: ViewModuleProps;
    layout: Layout;
    cols: number;
    rowHeight: number;
    isEditing: boolean;
    onLayoutChange: (layout: Layout) => void;
    onDragStop: (layout: Layout, item: LayoutItem) => void;
    onResizeStart: (item: LayoutItem) => void;
    onResizeStop: (layout: Layout, item: LayoutItem) => void;
    registerItemRef: (key: string, node: HTMLDivElement | null) => void;
    flashKeys: string[];
}

const CustomView: React.FC<CustomViewProps> = ({
    modules,
    moduleOrder,
    moduleProps,
    layout,
    cols,
    rowHeight,
    isEditing,
    onLayoutChange,
    onDragStop,
    onResizeStart,
    onResizeStop,
    registerItemRef,
    flashKeys
}) => {
    const moduleMap = useMemo(
        () => new Map(modules.map((module) => [module.key, module])),
        [modules]
    );

    const layoutMap = useMemo(() => new Map(layout.map((item) => [item.i, item])), [layout]);

    const orderedLayouts = useMemo(
        () =>
            moduleOrder
                .map((key) => layoutMap.get(key))
                .filter((item): item is LayoutItem => Boolean(item)),
        [layoutMap, moduleOrder]
    );

    const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

    if (orderedLayouts.length === 0) {
        return (
            <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                    No modules selected yet. Choose what you want to show in this view.
                </Typography>
            </Stack>
        );
    }

    return (
        <Box ref={containerRef}>
            {mounted && (
                <GridLayout
                    width={width}
                    className={isEditing ? "custom-grid editing" : "custom-grid"}
                    layout={orderedLayouts}
                    compactor={noCompactor}
                    gridConfig={{
                        cols,
                        rowHeight,
                        margin: [8, 8],
                        containerPadding: [0, 0],
                        maxRows: Infinity
                    }}
                    dragConfig={{
                        enabled: isEditing,
                        bounded: false,
                        threshold: 3
                    }}
                    resizeConfig={{
                        enabled: isEditing,
                        handles: ["se", "s", "e"]
                    }}
                    onLayoutChange={(nextLayout: Layout) => onLayoutChange(nextLayout)}
                    onDragStop={(nextLayout, _oldItem, newItem) => {
                        if (newItem) {
                            onDragStop(nextLayout, newItem);
                        }
                    }}
                    onResizeStart={(_layout, _oldItem, newItem) => {
                        if (newItem) {
                            onResizeStart(newItem);
                        }
                    }}
                    onResizeStop={(nextLayout, _oldItem, newItem) => {
                        if (newItem) {
                            onResizeStop(nextLayout, newItem);
                        }
                    }}
                >
                    {orderedLayouts.map((item) => {
                        const module = moduleMap.get(item.i);
                        if (!module) return null;
                        const isFlashing = flashKeys.includes(item.i);
                        return (
                            <Box key={item.i} sx={{ height: "100%" }}>
                                <Box
                                    ref={(node: HTMLDivElement | null) => registerItemRef(item.i, node)}
                                    sx={(theme) => ({
                                        height: "100%",
                                        overflow: "hidden",
                                        borderRadius: 2,
                                        outline: isFlashing ? `2px solid ${theme.palette.error.main}` : "none",
                                        outlineOffset: isFlashing ? 2 : 0,
                                        transition: "outline-color 0.3s ease"
                                    })}
                                >
                                    <Box
                                        sx={{
                                            height: "100%",
                                            display: "flex",
                                            flexDirection: "column",
                                            "& > .MuiCard-root": {
                                                height: "100%",
                                                display: "flex",
                                                flexDirection: "column"
                                            }
                                        }}
                                    >
                                        {createElement(module.render, moduleProps)}
                                    </Box>
                                </Box>
                            </Box>
                        );
                    })}
                </GridLayout>
            )}
        </Box>
    );
};

export default CustomView;
