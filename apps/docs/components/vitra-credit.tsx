/** "Built and maintained by <Vitra.ai logo>" under the home page buttons. */
export function VitraCredit() {
  return (
    <>
      Built and maintained by
      <a href="https://vitra.ai" target="_blank" rel="noreferrer" aria-label="Vitra.ai">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vitra/vitra-logo.png" alt="Vitra.ai" width={78} height={22} className="od-only-light" style={{ height: 22, width: 'auto' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vitra/vitra-logo-white.png" alt="Vitra.ai" width={78} height={22} className="od-only-dark" style={{ height: 22, width: 'auto' }} />
      </a>
    </>
  );
}
