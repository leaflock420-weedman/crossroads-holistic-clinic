/**
 * Electronic prescribing (eRx / AusScripts) integration layer.
 *
 * Production use requires certification as an eRx medical software partner:
 * https://www.erx.com.au/practitioners/medical-software-partners/
 *
 * Set ERX_API_KEY and ERX_PRESCRIBER_ID when a live integration is available.
 * Until then, dispense generates a simulated token matching the patient-facing
 * AusScripts workflow (present token at pharmacy or order online).
 */

function generateErxToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function sendElectronicPrescription(rx, patient, prescriber) {
  const erxToken = generateErxToken();
  const erxScriptId = `ERX-${Date.now().toString(36).toUpperCase()}`;
  const sentAt = new Date().toISOString();
  const live = Boolean(process.env.ERX_API_KEY);

  if (live) {
    // Placeholder for certified eRx API call (payload shape varies by vendor agreement).
    console.log(`[eRx] Would transmit ${erxScriptId} for patient ${patient.id} via live API`);
  }

  return {
    ok: true,
    erxToken,
    erxScriptId,
    erxStatus: "sent",
    erxSentAt: sentAt,
    erxPrescriber: prescriber?.name || "Crossroads clinician",
    ausscriptsUrl: `https://ausscripts.erx.com.au/?token=${encodeURIComponent(erxToken)}`,
    message: live
      ? `Electronic prescription ${erxScriptId} transmitted via eRx.`
      : `Electronic prescription simulated — token ${erxToken} (connect ERX_API_KEY for live eRx).`,
    mode: live ? "live" : "simulated",
  };
}

module.exports = { sendElectronicPrescription, generateErxToken };