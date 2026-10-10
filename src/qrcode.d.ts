declare module 'qrcode' {
  interface Options {
    margin?: number;
    width?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: { dark?: string; light?: string };
  }
  const QRCode: { toDataURL(text: string, opts?: Options): Promise<string> };
  export default QRCode;
}
