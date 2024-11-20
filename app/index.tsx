import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
  SectionList,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, isWithinInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { useTransactions, TransactionTypes } from '../context/TransactionsContext';
import Colors from '../constants/Colors';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { MaterialIcons } from '@expo/vector-icons';

export default function Home() {
  const { transactions, deleteTransaction, importTransactions, exportTransactions } = useTransactions();
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [expandedSections, setExpandedSections] = useState([]);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const getCurrentMonthBalance = useCallback(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    return transactions.reduce((total, transaction) => {
      const transactionDate = parseISO(transaction.date);
      if (isWithinInterval(transactionDate, { start, end })) {
        return total + (transaction.type === TransactionTypes.INCOME ? transaction.amount : -transaction.amount);
      }
      return total;
    }, 0);
  }, [transactions]);

  const handleConfirmDate = useCallback((date, isStart = true) => {
    if (isStart) {
      setStartDate(date);
      setShowStartPicker(false);
      if (endDate && date > endDate) {
        setEndDate(date);
      }
    } else {
      if (startDate && date < startDate) {
        Alert.alert('Fecha inválida', 'La fecha final no puede ser anterior a la fecha inicial');
        return;
      }
      setEndDate(date);
      setShowEndPicker(false);
    }
  }, [startDate, endDate]);

  const handleImport = useCallback(async () => {
    try {
      await importTransactions();
      Alert.alert('Éxito', '¡Transacciones importadas correctamente!');
    } catch (error) {
      Alert.alert('Error', 'No se pudieron importar las transacciones.');
    }
  }, [importTransactions]);

  const handleExport = useCallback(async () => {
    try {
      await exportTransactions();
      Alert.alert('Éxito', '¡Transacciones exportadas correctamente!');
    } catch (error) {
      Alert.alert('Error', 'No se pudieron exportar las transacciones.');
    }
  }, [exportTransactions]);

  const createHTMLContent = useCallback(() => {
    let netBalance = 0;

    const filteredTransactions = transactions.filter((transaction) => {
      if (!startDate && !endDate) return true;
      const transactionDate = parseISO(transaction.date);
      const start = startDate || new Date(0);
      const end = endDate || new Date(2099, 11, 31);
      return isWithinInterval(transactionDate, { start, end });
    });

    const sortedTransactions = [...filteredTransactions].sort(
      (a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()
    );

    sortedTransactions.forEach((t) => {
      netBalance += t.type === TransactionTypes.INCOME ? t.amount : -t.amount;
    });

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
              padding: 20px;
              font-size: 14px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px;
            }
            th, td { 
              border: 1px solid #ddd; 
              padding: 8px; 
              text-align: left;
            }
            th { 
              background-color: #f2f2f2; 
            }
            .summary { 
              margin: 20px 0;
              padding: 15px;
              background-color: #f8f9fa;
              border-radius: 5px;
            }
            .total-row {
              font-weight: bold;
              background-color: #f8f9fa;
            }
          </style>
        </head>
        <body>
          <h1>Informe de Transacciones</h1>
          <p>Período: ${startDate ? format(startDate, 'dd/MM/yyyy') : 'Inicio'} a ${endDate ? format(endDate, 'dd/MM/yyyy') : 'Fin'}</p>
          
          <div class="summary">
            <h2>Resumen</h2>
            <p>Balance Neto: ${netBalance >= 0 ? '+' : ''}€${netBalance.toFixed(2)}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              ${sortedTransactions
                .map(
                  (t) => `
                <tr>
                  <td>${format(parseISO(t.date), 'dd/MM/yyyy')}</td>
                  <td>${t.description}</td>
                  <td style="text-align: right; color: ${t.type === TransactionTypes.INCOME ? 'green' : 'red'}">
                    ${t.type === TransactionTypes.INCOME ? '+' : '-'}€${t.amount.toFixed(2)}
                  </td>
                </tr>
              `
                )
                .join('')}
              <tr class="total-row">
                <td colspan="2">Balance Neto</td>
                <td style="text-align: right; color: ${netBalance >= 0 ? 'green' : 'red'}">
                  ${netBalance >= 0 ? '+' : ''}€${netBalance.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
  }, [transactions, startDate, endDate]);

  const handleExportWithDates = useCallback(async () => {
    if (!startDate && !endDate) {
      Alert.alert('Seleccionar rango de fechas', 'Por favor, selecciona un rango de fechas para exportar');
      return;
    }

    try {
      const { uri } = await Print.printToFileAsync({
        html: createHTMLContent(),
        base64: false,
      });

      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
      });

      setShowExportModal(false);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      Alert.alert('Error', 'No se pudo generar el informe PDF');
    }
  }, [startDate, endDate, createHTMLContent]);

  const handleDelete = useCallback((id) => {
    Alert.alert(
      'Eliminar Transacción',
      '¿Estás seguro de que quieres eliminar esta transacción?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => deleteTransaction(id)
        },
      ]
    );
  }, [deleteTransaction]);

  const toggleSection = useCallback((sectionId) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  }, []);

  const handleDateChange = useCallback((event, selectedDate) => {
    const currentDate = selectedDate || (showStartPicker ? startDate : endDate);
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      setShowEndPicker(false);
    }
    if (showStartPicker) {
      handleConfirmDate(currentDate, true);
    } else {
      handleConfirmDate(currentDate, false);
    }
  }, [handleConfirmDate, showStartPicker, startDate, endDate]);

  const clearDates = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, []);

  const sections = useMemo(() => {
    const filteredTransactions = transactions.filter((transaction) => {
      if (!startDate && !endDate) return true;
      const transactionDate = parseISO(transaction.date);
      const start = startDate || new Date(0);
      const end = endDate || new Date(2099, 11, 31);
      return isWithinInterval(transactionDate, { start, end });
    });

    const groups = filteredTransactions.reduce((acc, transaction) => {
      const date = format(parseISO(transaction.date), 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = {
          id: date,
          title: format(parseISO(transaction.date), 'dd/MM/yyyy'),
          data: [],
          balance: 0,
        };
      }
      acc[date].data.push(transaction);
      acc[date].balance +=
        transaction.type === TransactionTypes.INCOME
          ? transaction.amount
          : -transaction.amount;
      return acc;
    }, {});

    return Object.values(groups)
      .map((section) => ({
        ...section,
        data: expandedSections.includes(section.id) ? section.data : [],
      }))
      .sort((a, b) => parseISO(b.id).getTime() - parseISO(a.id).getTime());
  }, [transactions, startDate, endDate, expandedSections]);

  const renderItem = useCallback(({ item: transaction }) => (
    <TouchableOpacity
      style={styles.transaction}
      onLongPress={() => handleDelete(transaction.id)}
    >
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle}>
          {transaction.description}
        </Text>
      </View>
      <View style={styles.amountContainer}>
        <MaterialIcons
          name={transaction.type === TransactionTypes.INCOME ? 'arrow-upward' : 'arrow-downward'}
          size={16}
          color={transaction.type === TransactionTypes.INCOME ? Colors.income : Colors.expense}
        />
        <Text
          style={[
            styles.transactionAmount,
            transaction.type === TransactionTypes.INCOME
              ? styles.income
              : styles.expense,
          ]}
        >
          €{transaction.amount.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  ), [handleDelete]);

  const renderSectionHeader = useCallback(({ section }) => (
    <TouchableOpacity
      style={styles.dateSection}
      onPress={() => toggleSection(section.id)}
    >
      <View style={styles.dateSectionHeader}>
        <View style={styles.dateSectionLeft}>
          <MaterialIcons
            name={expandedSections.includes(section.id) ? 'expand-more' : 'chevron-right'}
            size={24}
            color={Colors.text}
          />
          <Text style={styles.dateSectionTitle}>{section.title}</Text>
        </View>
        <Text
          style={[
            styles.dateSectionTotal,
            section.balance >= 0 ? styles.income : styles.expense,
          ]}
        >
          {section.balance >= 0 ? '+' : ''}€{section.balance.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  ), [expandedSections, toggleSection]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.monthText}>
            {format(new Date(), 'MMMM yyyy')}
          </Text>
          <Text style={styles.balanceTitle}>Balance del Mes Actual</Text>
          <Text style={[styles.balanceAmount, getCurrentMonthBalance() < 0 && styles.negative]}>
            {getCurrentMonthBalance() >= 0 ? '+' : ''}€{getCurrentMonthBalance().toFixed(2)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
        >
          <MaterialIcons name="more-vert" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push('/add-transaction')}
        >
          <MaterialIcons name="add" size={24} color={Colors.primary} />
          <Text style={styles.quickActionText}>Añadir</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => setShowExportModal(true)}
        >
          <MaterialIcons name="picture-as-pdf" size={24} color={Colors.primary} />
          <Text style={styles.quickActionText}>Exportar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={handleImport}
        >
          <MaterialIcons name="file-upload" size={24} color={Colors.primary} />
          <Text style={styles.quickActionText}>Importar</Text>
        </TouchableOpacity>
      </View>

      {/* Transactions List */}
      <SectionList
        style={styles.sectionList}
        contentContainerStyle={styles.sectionListContent}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
      />

      {/* Date Pickers */}
      {(showStartPicker || showEndPicker) && (
        <DateTimePicker
          value={showStartPicker ? (startDate || new Date()) : (endDate || new Date())}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={showEndPicker ? startDate : undefined}
        />
      )}

      {/* Export Date Filter Modal */}
      <Modal
        visible={showExportModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={styles.exportModalOverlay}>
          <View style={styles.exportModalContent}>
            <View style={styles.exportModalHeader}>
              <Text style={styles.exportModalTitle}>Seleccionar Rango de Fechas</Text>
              <TouchableOpacity
                onPress={() => setShowExportModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.dateFilterContainer}>
              <View style={styles.dateInputsRow}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowStartPicker(true)}
                >
                  <MaterialIcons name="event" size={20} color={Colors.primary} />
                  <Text style={styles.dateButtonText}>
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Fecha Inicial'}
                  </Text>
                </TouchableOpacity>

                <MaterialIcons name="arrow-forward" size={20} color={Colors.text} />

                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowEndPicker(true)}
                >
                  <MaterialIcons name="event" size={20} color={Colors.primary} />
                  <Text style={styles.dateButtonText}>
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fecha Final'}
                  </Text>
                </TouchableOpacity>
              </View>

              {(startDate || endDate) && (
                <TouchableOpacity
                  style={styles.clearDateButton}
                  onPress={clearDates}
                >
                  <MaterialIcons name="clear" size={20} color={Colors.white} />
                  <Text style={styles.clearDateButtonText}>Limpiar Fechas</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleExportWithDates}
            >
              <MaterialIcons name="file-download" size={20} color={Colors.white} />
              <Text style={styles.exportButtonText}>Exportar a PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContent}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                handleExport();
                setMenuVisible(false);
              }}
            >
              <MaterialIcons name="file-download" size={24} color={Colors.primary} />
              <Text style={styles.menuItemText}>Exportar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                handleImport();
                setMenuVisible(false);
              }}
            >
              <MaterialIcons name="file-upload" size={24} color={Colors.primary} />
              <Text style={styles.menuItemText}>Importar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  monthText: {
    color: Colors.white,
    fontSize: 16,
    opacity: 0.8,
  },
  balanceTitle: {
    color: Colors.white,
    fontSize: 14,
    marginTop: 8,
  },
  balanceAmount: {
    color: Colors.white,
    fontSize: 32,
    fontWeight: 'bold',
  },
  menuButton: {
    padding: 8,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 8,
    margin: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  quickActionButton: {
    alignItems: 'center',
    padding: 8,
  },
  quickActionText: {
    color: Colors.text,
    marginTop: 4,
    fontSize: 12,
  },
  sectionList: {
    flex: 1,
  },
  sectionListContent: {
    paddingBottom: 20,
  },
  dateSection: {
    backgroundColor: Colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateSectionTitle: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 8,
  },
  dateSectionTotal: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  transaction: {
    backgroundColor: Colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    color: Colors.text,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  income: {
    color: Colors.income,
  },
  expense: {
    color: Colors.expense,
  },
  negative: {
    color: Colors.expense,
  },
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  exportModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  exportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  exportModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  closeButton: {
    padding: 4,
  },
  dateFilterContainer: {
    marginBottom: 20,
  },
  dateInputsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lightGray,
    padding: 12,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 8,
  },
  dateButtonText: {
    marginLeft: 8,
    color: Colors.text,
  },
  clearDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    padding: 12,
    borderRadius: 8,
  },
  clearDateButtonText: {
    color: Colors.white,
    marginLeft: 8,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 8,
  },
  exportButtonText: {
    color: Colors.white,
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuItemText: {
    marginLeft: 16,
    fontSize: 16,
    color: Colors.text,
  },
});