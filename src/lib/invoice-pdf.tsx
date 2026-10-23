import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { InvoicePdfViewModel } from "./invoice-pdf-data";

// The app ships an OFL-licensed Noto Sans so every currency glyph (₹, €, £,
// ¥) renders; the built-in Helvetica is WinAnsi-only and mangles them.
const FONT_DIRECTORY = path.join(process.cwd(), "src", "assets", "fonts");

Font.register({
  family: "Noto Sans",
  fonts: [
    {
      src: path.join(FONT_DIRECTORY, "NotoSans-Regular.ttf"),
      fontWeight: "normal",
    },
    {
      src: path.join(FONT_DIRECTORY, "NotoSans-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "Noto Sans",
    color: "#1e293b",
    lineHeight: 1.45,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  businessBlock: { maxWidth: 280 },
  businessName: { fontSize: 16, fontWeight: "bold" },
  businessAddress: { marginTop: 4, color: "#475569" },
  logo: { height: 40, maxWidth: 140, objectFit: "contain" },
  metaBlock: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 20, fontWeight: "bold", letterSpacing: 1 },
  statusPill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
    fontSize: 9,
    fontWeight: "bold",
  },
  statusPaid: { backgroundColor: "#d1fae5", color: "#065f46" },
  statusOverdue: { backgroundColor: "#fee2e2", color: "#991b1b" },
  statusSent: { backgroundColor: "#dbeafe", color: "#1e40af" },
  statusDraft: { backgroundColor: "#e2e8f0", color: "#334155" },
  datesRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  dateColumn: { alignItems: "flex-end" },
  label: { fontSize: 8, color: "#64748b" },
  billTo: { marginBottom: 16, maxWidth: 280 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: "bold",
  },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingVertical: 5 },
  colDescription: { flex: 5 },
  colQuantity: { flex: 1, textAlign: "right" },
  colUnitPrice: { flex: 2, textAlign: "right" },
  colAmount: { flex: 2, textAlign: "right" },
  totalsBlock: { marginTop: 16, marginLeft: "auto", width: 220 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalsLabel: { color: "#475569" },
  totalRow: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    flexDirection: "row",
    justifyContent: "space-between",
    fontWeight: "bold",
    fontSize: 12,
  },
  section: { marginTop: 20, maxWidth: 420 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
  },
});

const STATUS_STYLES: Record<string, keyof typeof styles> = {
  Paid: "statusPaid",
  Overdue: "statusOverdue",
  Sent: "statusSent",
  Draft: "statusDraft",
};

export function InvoiceDocument({
  model,
  logoBytes,
}: {
  model: InvoicePdfViewModel;
  logoBytes?: Buffer | null;
}) {
  const statusStyle = STATUS_STYLES[model.statusText] ?? "statusDraft";

  return (
    <Document
      title={`Invoice ${model.invoiceNumber}`}
      author={model.businessName}
      subject="Invoice"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow} wrap={false}>
          <View style={styles.businessBlock}>
            <Text style={styles.businessName}>{model.businessName}</Text>
            {model.businessAddress ? (
              <Text style={styles.businessAddress}>{model.businessAddress}</Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            {logoBytes ? (
              // react-pdf primitives are not DOM elements; the alt-text rule
              // does not apply and the logo is decorative.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.logo} src={logoBytes} />
            ) : null}
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text>{model.invoiceNumber}</Text>
            <Text style={[styles.statusPill, styles[statusStyle]]}>
              {model.statusText}
            </Text>
            <View style={styles.datesRow}>
              <View style={styles.dateColumn}>
                <Text style={styles.label}>Issued</Text>
                <Text>{model.issueDateText}</Text>
              </View>
              <View style={styles.dateColumn}>
                <Text style={styles.label}>Due</Text>
                <Text>{model.dueDateText}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.billTo} wrap={false}>
          <Text style={styles.sectionTitle}>BILL TO</Text>
          <Text>{model.client.name}</Text>
          {model.client.address ? <Text>{model.client.address}</Text> : null}
          {model.client.email ? <Text>{model.client.email}</Text> : null}
          {model.client.phone ? <Text>{model.client.phone}</Text> : null}
        </View>

        <View style={styles.tableHeader} wrap={false} fixed>
          <Text style={styles.colDescription}>Description</Text>
          <Text style={styles.colQuantity}>Qty</Text>
          <Text style={styles.colUnitPrice}>Unit price</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>

        {model.items.map((item, index) => (
          <View key={index} style={styles.row} wrap={false}>
            <Text style={styles.colDescription}>{item.description}</Text>
            <Text style={styles.colQuantity}>{item.quantityText}</Text>
            <Text style={styles.colUnitPrice}>{item.unitPriceText}</Text>
            <Text style={styles.colAmount}>{item.amountText}</Text>
          </View>
        ))}

        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text>{model.subtotalText}</Text>
          </View>
          {model.discountText ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text>−{model.discountText}</Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax ({model.taxPercentLabel}%)</Text>
            <Text>{model.taxText}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>TOTAL</Text>
            <Text>{model.totalText}</Text>
          </View>
        </View>

        {model.notes ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text>{model.notes}</Text>
          </View>
        ) : null}

        {model.paymentInstructions ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>PAYMENT INSTRUCTIONS</Text>
            <Text>{model.paymentInstructions}</Text>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${model.invoiceNumber} — Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
