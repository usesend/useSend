import {env} from "~/env";

export function isCloud() {
    return env.NEXT_PUBLIC_IS_CLOUD;
}

export function isSelfHosted() {
    return !isCloud();
}

export function isEmailCleanupEnabled() {
    const days = env.EMAIL_CLEANUP_DAYS;
    if (days === undefined || isNaN(days) || days <= 0) {
        return false;
    }
    return true;
}
