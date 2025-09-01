/*
    NOTES:

    The choice to not cache responses that expire at the exact current time/date is intentional.
    
    Consider implementing instantiation of CustomFetch objects,
    instead of having everything static
    to allow for multiple caching use cases.

    The 'getCacheControlDirective' method may be overcomplicated, and
    String.split might be a much more simple way of going about the string parsing.
    Need to test for performance to justify changing it.
*/

/**
 * @typedef {[CachedResponseKey, Response]} CachedResponse
 */

/**
 * @typedef CachedResponseKey
 * @property {string} resource
 * @property {Object<string, any>} options
 */

/**
 * Allows for fetches with memory caching, allowing faster fetches within process lifetimes.
 */
class CustomFetch {
    static cleanupCacheIntervalTimeMS = 1000 * 10;
    static #cleanupCacheInterval = -Infinity;
    static { CustomFetch.#setCleanupCacheInterval(); }
    set cleanupCacheIntervalTimeMS(ms = -1) {
        if (typeof ms !== "number" || Number.isNaN(ms) || isNaN(ms) || ms < 1) {
            console.error(new Error(
                `${ms} is an invalid time for the cache-cleanup interval.`
            ));
            return;
        }

        CustomFetch.cleanupCacheIntervalTimeMS = ms;
        CustomFetch.#setCleanupCacheInterval();
    }

    /**
     * @type {CachedResponse}
     */
    static cachedResponses = new Map();
    
    static fetch(resource, options = {}) {
        if (!resource) {
            return Promise.reject(`(${resource}) is an invalid resource to fetch.`);
        }

        const key = JSON.stringify({ resource, options });
        const value = CustomFetch.cachedResponses.get(key);
        if (value instanceof Response && !CustomFetch.isCacheExpired(value.headers)) {
            return Promise.resolve(value.clone());
        }

        const resPromise = fetch(resource, options);
        resPromise.then(res => {
            let shouldCache = CustomFetch.checkIfShouldCache(res.headers);
            if (!shouldCache) return;

            const key = JSON.stringify({ resource, options });
            CustomFetch.cachedResponses.set(key, res.clone());
        });
        return resPromise;
    }

    static cleanup() {
        const cached = CustomFetch.cachedResponses;
        for (const [key, response] of cached.entries()) {
            if (!CustomFetch.isCacheExpired(response.headers)) continue;
            cached.delete(key);
        }
    }

    static clearCache(options = {}) {
        
    }
    static clearAllCache() {
        
    }

    /**
     * @param {Headers} headers 
     * @param {number} currentDate Optional, can set an arbitrary date to check from for expiration
     * @returns {boolean}
     */
    static isCacheExpired(headers, currentDate = Date.now()) {
        const cacheControl = headers.get("Cache-Control");
        const date = headers.get("Date");
        const expires = headers.get("Expires");

        if (cacheControl && date) {
            const maxAgeSeconds = parseInt(
                CustomFetch.getCacheControlDirective(cacheControl, "max-age") || 0
            ) * 1000;
            const expireDate = Date.parse(date) + maxAgeSeconds;
            if (expireDate < currentDate) {
                return true;
            }
        }

        if (expires && Date.parse(expires) < currentDate) {
            return true;
        }
        
        return false;
    }

    /**
     * @param {Headers} headers
     * @param {number} currentDate Optional, used for comparing the Expires header date to an arbitrary (by default, the current) date
     * @returns {boolean}
     */
    static checkIfShouldCache(headers, currentDate = Date.now()) {
        const cacheControl = headers.get("Cache-Control");
        if (cacheControl) {
            const noCache = CustomFetch.getCacheControlDirective(cacheControl, "no-cache");
            const noStore = CustomFetch.getCacheControlDirective(cacheControl, "no-store");
            const maxAge = CustomFetch.getCacheControlDirective(cacheControl, "max-age");
            if (noCache !== "no-cache" && noStore !== "no-store" && maxAge !== "0") {
                return true;
            }
        }

        const expires = headers.get("Expires");
        if (expires && Date.parse(expires) > currentDate) {
            return true;
        }

        return false;
    }

    /**
     * Gets directive value.
     * 
     * Examples:
     * 
     * getCacheControlDirective("no-cache, max-age=0", "max-age") -> "0"
     * 
     * getCacheControlDirective("no-cache, max-age=0", "no-cache") -> "no-cache"
     * 
     * getCacheControlDirective("no-cache, max-age=0", "invalid directive") -> null
     * @param {string} headerStr Header value
     * @param {string} targetDir Name of directive to get value of
     * @param {number} maxIterationCount Optional, limits the amount of iteration through the header, as a safety against infinite iteration
     * @returns {string|null}
     */
    static getCacheControlDirective(headerStr, targetDir, maxIterationCount = Number.MAX_SAFE_INTEGER) {
        const dirSeparator = ",";
        const keyword = targetDir;
        let startIndex = headerStr.indexOf(keyword);
        let hasEqualSign = false;
        let i = 0;

        while (true) {
            if (startIndex === -1) break;
            if (i >= maxIterationCount) break;
            i++;

            // Check if the correct dir was found by
            // looking both behind and ahead of the dir name
            let beforeOk = false;
            switch (headerStr[startIndex-1]) {
                case undefined:
                case " ":
                    beforeOk = true;
                    break;
                default:
                    // Check for another match of target directive
                    startIndex = headerStr.indexOf(keyword, startIndex+1);
                    break;
            }
            if (!beforeOk) continue;

            let afterOk = false;
            switch (headerStr[startIndex+keyword.length]) {
                case "=":
                    hasEqualSign = true;
                case undefined:
                case dirSeparator:
                    afterOk = true;
                    break;
                default:
                    // Invalid target directive. Null will be returned
                    startIndex = -1;
                    break;
            }

            if (beforeOk && afterOk) break;
        }

        if (startIndex === -1) return null;
        if (!hasEqualSign) return targetDir;
        
        const keywordOffset = "=".length;
        const valueStartIndex = startIndex + keyword.length + keywordOffset;
        let valueEndIndex = headerStr.indexOf(dirSeparator, valueStartIndex);
        if (valueEndIndex === -1) {
            valueEndIndex = headerStr.length;
        }
        const value = headerStr.substring(valueStartIndex, valueEndIndex);
        return value;
    }

    static #setCleanupCacheInterval() {
        const temp = CustomFetch.#cleanupCacheInterval;
        if (typeof temp === "number" && !Number.isNaN(temp) && !isNaN(temp)) {
            clearInterval(temp);
        }

        CustomFetch.#cleanupCacheInterval = setInterval(
            CustomFetch.cleanup,
        CustomFetch.cleanupCacheIntervalTimeMS);
    }
}

module.exports = CustomFetch;