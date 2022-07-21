export class DateUtils {
    
    static getLastSyncDataTimeMills(lastSyncMilliTicks: number) {
        // lastSyncMilliTicks represents DateTime.Ticks / 10000.
        if(lastSyncMilliTicks > 0) {
            const nanoTicks = lastSyncMilliTicks * 10000;
            return DateUtils.fromTicksToMills(nanoTicks);
        } else {
            return 0; // 0 means resync
        }
    }
    static fromTicksToMills(ticks: number) {
        return Number.isInteger(ticks) ? new Date(ticks / 1e+4 + new Date('0001-01-01T00:00:00Z').getTime()).getTime() : 0;
    }
    static fromTicksToDate(ticks: number) {
        return Number.isInteger(ticks) ? new Date(ticks / 1e+4 + new Date('0001-01-01T00:00:00Z').getTime()).toDateString() : null;
    }
}