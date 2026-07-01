const URLS = [
  ["home", "https://crossroads.clinic/"],
  ["www", "https://www.crossroads.clinic/"],
  ["book", "https://crossroads.clinic/start.html"],
  ["portal", "https://crossroads.clinic/portal.html"],
  ["doctor", "https://crossroads.clinic/doctor.html"],
  ["admin", "https://crossroads.clinic/admin.html"],
  ["api", "https://api.crossroads.clinic/api/health"],
  ["sub-book", "https://book.crossroads.clinic/"],
  ["sub-portal", "https://portal.crossroads.clinic/"],
];

async function check(name, url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    const ok = res.status < 400;
    console.log(`${ok ? "OK" : "FAIL"} ${name}: ${res.status} ${url}`);
    return ok;
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    return false;
  }
}

async function main() {
  let pass = 0;
  for (const [n, u] of URLS) if (await check(n, u)) pass++;

  const sites = await fetch("https://api.crossroads.clinic/api/sites").then((r) => r.json());
  console.log("API sites mode:", sites.mode);
  console.log("URLs:", JSON.stringify(sites.urls, null, 2));

  const login = await fetch("https://api.crossroads.clinic/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@crossroads.clinic", password: "demo1234" }),
  });
  const loginData = await login.json().catch(() => ({}));
  console.log(login.ok ? "OK demo login" : "FAIL demo login", login.status, loginData.token ? "token=yes" : "");

  console.log(`\n${pass}/${URLS.length} URLs OK`);
}

main();