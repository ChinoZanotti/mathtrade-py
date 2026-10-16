/**
 * Atribución obligatoria por los términos de la XML API de BGG:
 * logo "Powered by BGG" legible y con link a BoardGameGeek.
 * Si existe el logo oficial en /bgg/powered-by-bgg.png lo muestra; si no, una insignia de texto.
 */
import { useState } from 'react';

export default function PoweredByBgg() {
  const [hasLogo, setHasLogo] = useState(true);
  return (
    <a className="powered-bgg" href="https://boardgamegeek.com" target="_blank" rel="noopener noreferrer">
      {hasLogo ? (
        <img src="/bgg/powered-by-bgg.png" alt="Powered by BGG" height={28} onError={() => setHasLogo(false)} />
      ) : (
        <>
          Powered by <strong>BGG</strong>
        </>
      )}
    </a>
  );
}
