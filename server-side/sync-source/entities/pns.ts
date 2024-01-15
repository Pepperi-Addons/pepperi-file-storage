/**
 * Represents a PNS notification.
 * @interface
 */
interface PnsNotification {
    Type: "data";
    FilterAttributes: {
        /**
         * List of fields that were changed (contain all the fields and not only the fields you subscribe to).
         */
        ModifiedFields: string[];
        /**
         * UUID of the addon wo which the resource belongs.
         */
        AddonUUID: string;
        /**
         * List of modified objects.
         */
        ModifiedObjects: ModifiedObject[];
        /**
         * Resource name.
         */
        Resource: string;
        /**
         * Action type: "update", "insert", or "remove".
         */
        Action: "update" | "insert" | "remove";
        /**
         * UUID of the user that made the changes.
         */
        UserUUID: string;
        /**
         * Fields subscribed to in the filter policy. This property will be added only if subscribed to specific fields.
         */
        SubscriptionModifiedFields?: string[];
    };
    Message: {
        /**
         * UUID of the action.
         */
        ActionUUID: string;
        /**
         * List of modified objects in the message.
         */
        ModifiedObjects: ModifiedObject[];
    };
}

/**
 * Represents a modified object.
 * @interface
 */
interface ModifiedObject {
    /**
     * Key of the object.
     */
    ObjectKey: string;
    /**
     * Date and time when the object was modified.
     */
    ObjectModificationDateTime: string;
    /**
     * List of modified fields in the object.
     */
    ModifiedFields: ModifiedField[];
}

/**
 * Represents a modified field.
 * @interface
 */
interface ModifiedField {
    /**
     * ID of the field.
     */
    FieldID: string;
    /**
     * New value of the field.
     */
    NewValue: any; // Adjust the type according to your actual data type
    /**
     * Old value of the field.
     */
    OldValue: any; // Adjust the type according to your actual data type
}

/**
 * Represents a subset of {@link PnsNotification}, having only the necessary properties.
 * @interface
 */
interface ModifiedObjectNotification extends Omit<PnsNotification, "FilterAttributes" | "Message" | "Type"> {
    FilterAttributes: Omit<PnsNotification["FilterAttributes"], "ModifiedObjects">;
    Message: Omit<PnsNotification["Message"], "ActionUUID">;
} 
