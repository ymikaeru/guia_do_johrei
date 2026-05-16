#!/bin/bash
# Usa RangeHTTPServer para suportar HTTP Range requests (necessário para
# seek/scrub de áudio no modal do Culto Mensal). Fallback para http.server
# se rangehttpserver não estiver instalado.
echo "Starting Johrei Guia Prático Server..."
echo "Opening http://localhost:8000"
open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null || echo "Please open http://localhost:8000 manually"

if python3 -c "import RangeHTTPServer" 2>/dev/null; then
    python3 -m RangeHTTPServer 8000
else
    echo "AVISO: rangehttpserver não instalado — seek de áudio não vai funcionar."
    echo "       Instale com: pip install rangehttpserver"
    python3 -m http.server 8000
fi
