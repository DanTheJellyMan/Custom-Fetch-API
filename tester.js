const CustomFetch = require("./custom-fetch");

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