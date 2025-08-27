// TODO: add checking for an Expires header for caching, if Cache-Content is missing

// Consider implementing instantiation of CustomFetch objects,
// instead of having everything static
// to allow for multiple caching use cases.

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
     * Entry format:
     * 
     * [ { resource: string, options: {} }, Response ]
     */
    static cachedResponses = new Map();
    
    static fetch(resource, options = {}) {
        if (!resource) {
            return Promise.reject(`(${resource}) is an invalid resource to fetch.`);
        }

        // Check cachedResponses for a matching resource response
        const key = JSON.stringify({ resource, options });
        const value = CustomFetch.cachedResponses.get(key);
        if (value instanceof Headers && CustomFetch.isCacheExpired(value.headers)) {
            CustomFetch.cachedResponses.delete(key);
            return Promise.resolve(value);
        }
        const resPromise = globalThis.fetch(resource, options);
        resPromise.then(res => {
            // Do not cache if Cache-Control doesn't say to
            const cacheControl = res.headers.get("Cache-Control");
            let shouldCache = CustomFetch.checkIfShouldCache(cacheControl);
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
            console.log(`deleting cache (${new Date()}): ${JSON.parse(key).resource}`);
            cached.delete(key);
        }
    }

    static clearCache(options = {}) {
        
    }
    static clearAllCache() {
        
    }

    static isCacheExpired(headers, currentDate = Date.now()) {
        const cacheControl = headers.get("Cache-Control") || "";
        const maxAgeSeconds = parseInt(
            CustomFetch.getCacheControlDirective(cacheControl, "max-age") || 0
        ) * 1000;
        const expireDate = Date.parse(headers.get("Date")) + maxAgeSeconds;
        
        if (currentDate > expireDate) {
            return true;
        }
        return false;
    }

    static checkIfShouldCache(cacheControl) {
        const noCache = CustomFetch.getCacheControlDirective(cacheControl, "no-cache");
        const noStore = CustomFetch.getCacheControlDirective(cacheControl, "no-store");
        const maxAge = CustomFetch.getCacheControlDirective(cacheControl, "max-age");
        if (noCache === "no-cache" || noStore === "no-store" || maxAge === "0") {
            return false;
        }
        return true;
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
     * @returns {string|null}
     */
    static getCacheControlDirective(headerStr, targetDir) {
        const dirSeparator = ",";
        const keyword = targetDir;
        let startIndex = headerStr.indexOf(keyword);
        let hasEqualSign = false;
        while (true) {
            if (startIndex === -1) break;

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

const TESTING = true;
if (TESTING) {
    process.stdin.on("data", d => {
        d = d.toString("utf8").trim();
        if (d === "print cached") {
            return console.log(CustomFetch.cachedResponses);
        }
        try {
            eval(d);
        } catch (err) {
            console.error(new Error(err));
        }
    });
}