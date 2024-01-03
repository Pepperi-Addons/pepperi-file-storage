export interface ICrawlRequest {
    /**
     * Name of the crawler action
     */
    Name: string;
    /**
     * Description of the crawler action.
     */
    Description?: string;
    /**
     * Cannot run the same crawler twice (in parallel).
     */
    LockID?: string;
    SourceRelativeURL: string;
    TargetRelativeURL: string;
    /**
     * Goes into source URL request body.
     */
    SourceData?: any;
    /**
     * Goes into target URL request body.
     */
    TargetData?: any;
    /**
     * Maximum size of a page that the target can handle.
     */
    MaxPageSize?: number;
    /**
     * Maximum number of parallel pages that the caller can handle.
     * Default is 1.
     */
    MaxConcurrency?: number;
    /**
     * The blueprint of the outputs from the target (page response).
     */
    TargetOutputs?: TargetOutput[];
}

export interface TargetOutput {
    FieldID: string;
    Type: "Sum" | "Array";
    /** 
     * only for Array, default = no limit
     */
    Limit?: number;
}