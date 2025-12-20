
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function testInstance() {
    const url = 'https://iv.n8pjl.ca/api/v1/captions/WHqaF4jbUYU';
    try {
        console.log(`Testing ${url}...`);
        const res = await fetch(url, { timeout: 5000 });
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Length: ${text.length}`);
    } catch (e) {
        console.log(`Failed: ${e.message}`);
    }
}

async function testUrlParsing() {
    const complexUrl = 'https://www.youtube.com/api/timedtext?v=WHqaF4jbUYU&ei=FQlHaZqzFbWAp-oPwNr76A4&caps=asr&opi=112496729&exp=xpe&xoaf=5&xowf=1&xospf=1&hl=en&ip=0.0.0.0&ipbits=0&expire=1766288261&sparams=ip,ipbits,expire,v,ei,caps,opi,exp,xoaf&signature=45A98F9BD679F975250577A6C326DBDAE0372EB9.6E36CEEC61BD944CF46E97738BAB8A9104CB35F5&key=yt8&kind=asr&lang=en&variant=ec&fmt=vtt';
    const encoded = encodeURIComponent(complexUrl);
    const reqUrl = `/api/proxy?url=${encoded}&t=${Date.now()}`;

    console.log('\nTesting URL Parsing:');
    const urlIdx = reqUrl.indexOf('?');
    const queryString = reqUrl.substring(urlIdx + 1);
    const params = new URLSearchParams(queryString);
    const targetUrl = params.get('url');

    console.log(`Original: ${complexUrl.substring(0, 50)}...`);
    console.log(`Parsed:   ${targetUrl?.substring(0, 50)}...`);
    console.log(`Match:    ${complexUrl === targetUrl}`);
}

testInstance().then(testUrlParsing);
