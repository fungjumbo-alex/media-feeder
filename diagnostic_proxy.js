
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function runThemeTest() {
    const videoId = 'mEHZxZEN69U';
    const url = `https://www.youtube.com/watch?v=${videoId}&ucbcb=1`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+yt.20210328-17-p0.en+FX+417'
    };

    try {
        const response = await fetch(url, { headers });
        const text = await response.text();

        const hasThemeClasses = text.includes('darker-dark-theme');
        const hasWizGlobal = text.includes('window.WIZ_global_data');
        const hasJson = text.includes('ytInitialPlayerResponse');

        console.log('\n--- Theme and Metadata Test ---');
        console.log(`Has "darker-dark-theme": ${hasThemeClasses}`);
        console.log(`Has WIZ_global_data: ${hasWizGlobal}`);
        console.log(`Has ytInitialPlayerResponse: ${hasJson}`);

        if (hasThemeClasses && hasWizGlobal && hasJson) {
            console.log('\nRESULT: This is a 100% genuine YouTube Watch Page.');
        } else {
            console.log('\nRESULT: Likely a bare consent page or a modified view.');
        }
    } catch (e) {
        console.error(e);
    }
}

runThemeTest();
