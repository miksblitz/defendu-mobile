import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import type { ModulePurchaseInvoice } from '../lib/controllers/modulePurchases';

interface ModulePurchaseInvoiceScreenProps {
  invoice: ModulePurchaseInvoice;
  newCredits: number;
  onDone: () => void;
}

export default function ModulePurchaseInvoiceScreen({ invoice, newCredits, onDone }: ModulePurchaseInvoiceScreenProps) {
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={require('../assets/images/defendudashboardlogo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Module Purchase Complete</Text>
        <Text style={styles.subtitle}>Your training access has been updated instantly.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Invoice</Text>
          <Text style={styles.value}>{invoice.invoiceNo}</Text>
          <Text style={styles.line}>Reference: {invoice.referenceNo}</Text>
          <Text style={styles.line}>Type: {invoice.purchaseType === 'category' ? 'Category unlock' : 'Single module'}</Text>
          <Text style={styles.line}>Category: {invoice.category}</Text>
          {invoice.moduleTitle ? <Text style={styles.line}>Module: {invoice.moduleTitle}</Text> : null}
          <Text style={styles.line}>Unlocked modules: {invoice.purchasedModuleIds.length}</Text>
          <Text style={styles.line}>Spent: {invoice.amountCredits} credits</Text>
          <Text style={styles.line}>Remaining balance: {newCredits} credits</Text>
          <Text style={styles.line}>Date: {new Date(invoice.createdAt).toLocaleString()}</Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={onDone} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#041527' },
  content: { padding: 20, paddingBottom: 36, alignItems: 'center' },
  logo: { width: 220, height: 70, marginBottom: 12 },
  title: { color: '#07bbc0', fontSize: 27, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#6b8693', fontSize: 14, marginTop: 8, marginBottom: 20, textAlign: 'center' },
  card: {
    width: '100%',
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 16,
    padding: 14,
  },
  label: { color: '#6b8693', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  value: { color: '#07bbc0', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  line: { color: '#FFFFFF', fontSize: 13, marginBottom: 6 },
  button: {
    marginTop: 22,
    width: '100%',
    backgroundColor: '#07bbc0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#041527', fontSize: 16, fontWeight: '800' },
});
