export interface NodeMetadata {
    id: string;
    name: string;
    file_name?: string;       // Filename from server
    commitAge: number;        // Age in days
    hyperlinkCount: number;   // Number of hyperlinks
    fileSize: number;         // Size in bytes
    nodeSize: number;         // Normalized node size (0-50)
    importance: number;       // Normalized importance (0-1)
    position: {
        x: number;
        y: number;
        z: number;
    };
}

export interface HologramSettings {
    enabled: boolean;
    desktopQuality: 'low' | 'medium' | 'high';
    xrQuality: 'low' | 'medium';
    ringCount: number;
    ringSizes: number[];
    ringOpacity: number;
    ringColor: string;
    ringRotationSpeed: number;
    enableBuckminster: boolean;
    buckminsterScale: number;
    buckminsterOpacity: number;
    enableGeodesic: boolean;
    geodesicScale: number;
    geodesicOpacity: number;
    enableTriangleSphere: boolean;
    triangleSphereScale: number;
    triangleSphereOpacity: number;
    globalRotationSpeed: number;
    wireframeThickness: number;
}

export interface LabelSettings {
    textRenderingMode: 'sdf' | 'bitmap';
    textResolution: number;
    textPadding: number;
    textOutlineWidth: number;
    textOutlineColor: string;
    billboardMode: 'camera' | 'vertical';
    desktopFontSize: number;
    enableLabels: boolean;
    textColor: string;
}

// Alias for backward compatibility and clarity
export type Metadata = NodeMetadata;