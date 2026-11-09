# ---------------------------------------------------------------------------
# Piper — AI rehberin Türkçe sesli yanıtları (metinden sese).
#
# Yalnız compose iç ağından erişilir; dışarıya port açılmaz. Uygulama
# PIPER_URL=http://piper:5000 ile çağırır (bkz. apps/web/src/app/api/voice).
# Ses modeli imaja gömülür ki kalkışta internete bağımlı olmasın.
#
# Lisans: piper-tts GPL-3.0. Ayrı bir süreç/imaj olarak çalışır, uygulama
# koduyla birleştirilmez.
# ---------------------------------------------------------------------------

FROM python:3.11-slim

ARG PIPER_VERSION=1.8.0
ARG PIPER_VOICE=tr_TR-dfki-medium

RUN pip install --no-cache-dir "piper-tts[http]==${PIPER_VERSION}"

RUN useradd --system --create-home piper
WORKDIR /voices
RUN python -m piper.download_voices "${PIPER_VOICE}" --download-dir /voices \
    && chown -R piper /voices
USER piper

ENV PIPER_VOICE=${PIPER_VOICE}
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5000/info', timeout=4)" || exit 1

CMD ["sh", "-c", "exec python -m piper.http_server --host 0.0.0.0 --port 5000 --data-dir /voices -m \"$PIPER_VOICE\""]
