"use client";

import { Camera, Check, QrCode, ReceiptText } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FiscalImportActionState } from "@/lib/fiscal-import";
import {
  DatePicker,
  SearchableCombobox,
  TextAreaField,
  type ComboboxOption,
} from "@/components/form-controls";
import { ModalGlassHeader } from "@/components/modal-glass-header";

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorLike;

type FiscalImportDialogProps = {
  state: FiscalImportActionState;
  action: (payload: FormData) => void;
  pending: boolean;
};

const sampleKey = "35260812345678000123650010000001231234567890";
const sampleLines = [
  "Chantilly Amélia 1 L; 2; UN; 37,80; 7896010401514",
  "Harald Melken meio amargo 1,01 kg; 1; UN; 34,90; 7897077821017",
].join("\n");

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const today = new Date().toISOString().slice(0, 10);

function FiscalLineReview({
  line,
  options,
}: {
  line: NonNullable<FiscalImportActionState["document"]>["lines"][number];
  options: ComboboxOption[];
}) {
  const [selectedItem, setSelectedItem] = useState(
    line.suggestedCommercialItemId ?? "",
  );

  return (
    <fieldset className="fiscal-line-review">
      <legend>
        <span>{line.lineNumber}</span>
        <span>{line.originalDescription}</span>
      </legend>
      <input type="hidden" name="lineId" value={line.id} />
      <div className="fiscal-line-source">
        <span>
          {line.quantity} {line.unit}
        </span>
        <strong>{currency.format(line.totalAmount)}</strong>
        {line.gtin ? <small>GTIN {line.gtin}</small> : null}
      </div>
      <div className="fiscal-line-fields">
        <div className="form-field form-field-wide">
          <label htmlFor={`fiscal-item-${line.id}`}>Qual produto é este?</label>
          <SearchableCombobox
            id={`fiscal-item-${line.id}`}
            name={`item:${line.id}`}
            options={options}
            value={selectedItem}
            onValueChange={setSelectedItem}
            placeholder="Busque na despensa"
            emptyMessage="Nenhum produto comprado conhecido corresponde a esta linha."
            required
          />
          <small>
            A sugestão nunca é confirmada silenciosamente. Confira marca e
            embalagem.
          </small>
        </div>
        <div className="form-field">
          <label htmlFor={`fiscal-expiry-${line.id}`}>Validade</label>
          <DatePicker
            id={`fiscal-expiry-${line.id}`}
            name={`expiry:${line.id}`}
          />
        </div>
        <label className="form-field">
          <span>Lote da embalagem</span>
          <input name={`lot:${line.id}`} placeholder="Opcional" />
        </label>
      </div>
    </fieldset>
  );
}

export function FiscalImportDialog({
  state,
  action,
  pending,
}: FiscalImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [source, setSource] = useState("");
  const [receiptText, setReceiptText] = useState("");
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [freshCapture, setFreshCapture] = useState(true);

  function stopCamera() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  });

  useEffect(() => {
    if (state.status === "success" && state.notificationId) {
      dialogRef.current?.close();
    }
  }, [state.notificationId, state.status]);

  useEffect(() => {
    if (state.status === "review" && state.document) {
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [state.document, state.status]);

  function openDialog() {
    setFreshCapture(true);
    setCameraMessage("");
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    stopCamera();
    dialogRef.current?.close();
  }

  async function startCamera() {
    const Detector = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        "Este navegador não oferece leitura direta. Cole o endereço do QR Code ou a chave abaixo.",
      );
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraActive(true);
      setCameraMessage("Aponte a câmera para o QR Code da NFC-e.");
      const detector = new Detector({ formats: ["qr_code"] });
      const inspect = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const codes = await detector.detect(videoRef.current);
        const value = codes[0]?.rawValue;
        if (value) {
          setSource(value);
          setCameraMessage("QR Code reconhecido. Agora confira os itens.");
          stopCamera();
          return;
        }
        frameRef.current = requestAnimationFrame(() => void inspect());
      };
      frameRef.current = requestAnimationFrame(() => void inspect());
    } catch {
      stopCamera();
      setCameraMessage(
        "Não foi possível abrir a câmera. Você ainda pode colar o endereço ou a chave.",
      );
    }
  }

  function useExample() {
    setSource(sampleKey);
    setReceiptText(sampleLines);
    setCameraMessage("Exemplo preenchido para você experimentar o fluxo.");
  }

  const reviewDocument =
    !freshCapture && state.document?.status === "requires_review"
      ? state.document
      : null;
  const catalogueOptions: ComboboxOption[] =
    state.document?.catalogue.map((item) => ({
      value: item.id,
      label: `${item.displayName} · ${item.packageLabel}`,
      keywords: item.gtin ?? "",
    })) ?? [];

  let body: ReactNode;
  if (reviewDocument) {
    body = (
      <form action={action} className="fiscal-review-form">
        <input type="hidden" name="operation" value="confirm" />
        <input type="hidden" name="documentId" value={reviewDocument.id} />
        <input
          type="hidden"
          name="idempotencyKey"
          value={crypto.randomUUID()}
        />
        <div className="fiscal-document-summary">
          <div>
            <span>Documento</span>
            <strong>final {reviewDocument.keyEnding}</strong>
          </div>
          <div>
            <span>Itens lidos</span>
            <strong>{reviewDocument.lines.length}</strong>
          </div>
          <div>
            <span>Total reconhecido</span>
            <strong>{currency.format(reviewDocument.totalAmount ?? 0)}</strong>
          </div>
        </div>
        <div className="fiscal-entry-fields">
          <div className="form-field">
            <label htmlFor="fiscal-entry-date">Data de entrada</label>
            <DatePicker
              id="fiscal-entry-date"
              name="entryDate"
              defaultValue={today}
              required
            />
          </div>
          <label className="form-field">
            <span>Onde comprou?</span>
            <input
              name="supplierName"
              defaultValue={reviewDocument.issuerName ?? ""}
              placeholder="Estabelecimento opcional"
            />
          </label>
        </div>
        <div className="fiscal-lines">
          {reviewDocument.lines.map((line) => (
            <FiscalLineReview
              key={line.id}
              line={line}
              options={catalogueOptions}
            />
          ))}
        </div>
        {state.status === "error" ? (
          <p className="form-message-error" role="alert">
            {state.message}
          </p>
        ) : (
          <p className="fiscal-review-note">
            <Check aria-hidden="true" /> Nada entra na despensa até esta
            conferência.
          </p>
        )}
        <footer className="dialog-actions">
          <button
            className="quiet-action"
            type="button"
            onClick={() => setFreshCapture(true)}
          >
            Voltar à captura
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending}
          >
            <ReceiptText aria-hidden="true" />
            {pending ? "Guardando…" : "Confirmar e guardar"}
          </button>
        </footer>
      </form>
    );
  } else {
    body = (
      <form
        action={action}
        className="fiscal-capture-form"
        onSubmit={() => setFreshCapture(false)}
      >
        <input type="hidden" name="operation" value="capture" />
        <fieldset>
          <legend>
            <span>1</span> Encontre a nota
          </legend>
          <div className="fiscal-source-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void startCamera()}
            >
              <Camera aria-hidden="true" /> Abrir câmera
            </button>
            <button className="quiet-action" type="button" onClick={useExample}>
              Usar exemplo
            </button>
          </div>
          <video
            className="fiscal-camera"
            ref={videoRef}
            hidden={!cameraActive}
            muted
            playsInline
            aria-label="Imagem da câmera para leitura do QR Code"
          />
          {cameraMessage ? <p className="field-help">{cameraMessage}</p> : null}
          <label htmlFor="fiscal-source">Endereço do QR Code ou chave</label>
          <input
            id="fiscal-source"
            name="source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="Cole o endereço completo ou os 44 números"
            autoComplete="off"
            required
            autoFocus
          />
        </fieldset>
        <fieldset>
          <legend>
            <span>2</span> Traga os itens para conferência
          </legend>
          <label htmlFor="fiscal-lines-text">Itens exibidos na nota</label>
          <TextAreaField
            id="fiscal-lines-text"
            name="receiptText"
            value={receiptText}
            onValueChange={setReceiptText}
            maxLength={12000}
            placeholder="Chantilly Amélia 1 L; 2; UN; 37,80; 7896010401514"
            required
          />
          <small>
            Use uma linha por item: descrição; quantidade de embalagens;
            unidade; valor total; código de barras opcional.
          </small>
        </fieldset>
        {state.status === "error" ? (
          <p className="form-message-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <footer className="dialog-actions">
          <button className="quiet-action" type="button" onClick={closeDialog}>
            Cancelar
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending}
          >
            <QrCode aria-hidden="true" />
            {pending ? "Lendo…" : "Ler e revisar"}
          </button>
        </footer>
      </form>
    );
  }

  return (
    <>
      <button
        className="button button-secondary"
        type="button"
        aria-haspopup="dialog"
        onClick={openDialog}
      >
        <QrCode aria-hidden="true" /> Ler NFC-e
      </button>
      <dialog
        className="purchase-dialog fiscal-import-dialog"
        ref={dialogRef}
        aria-labelledby="fiscal-import-title"
        onClose={stopCamera}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <section className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Ler NFC-e"
            eyebrow="Entrada na despensa"
            closeLabel="Fechar leitura da NFC-e"
            onClose={closeDialog}
          />
          <div
            className="purchase-panel-scroll rounded-scroll-area"
            ref={scrollRef}
          >
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Importação assistida</p>
                <h2 id="fiscal-import-title">
                  A nota ajuda. Você dá a palavra final.
                </h2>
              </div>
              <p>
                O QR Code identifica a compra; nenhuma associação ou validade é
                confirmada sem a sua revisão.
              </p>
            </header>
            {body}
          </div>
        </section>
      </dialog>
    </>
  );
}
