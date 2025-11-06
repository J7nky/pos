export interface WeightConfiguration {
  // Global weight tracking settings
  enableWeightTracking: boolean;
  requireWeightForCashPurchases: boolean;
  requireWeightForCreditPurchases: boolean;
  requireWeightForCommissionItems: boolean; // false by default - optional for commission
  
  // Weight validation thresholds
  discrepancyThresholds: {
    minor: number; // percentage (default: 5%)
    major: number; // percentage (default: 10%)
    critical: number; // percentage (default: 20%)
  };
  
  // Weight difference tolerances (in kg)
  tolerances: {
    minimum: number; // minimum difference to consider (default: 0.1kg)
    warning: number; // warning threshold (default: 0.5kg)
    error: number; // error threshold (default: 1.0kg)
  };
  
  // Bill closing settings
  billClosingSettings: {
    allowCloseWithMinorDiscrepancies: boolean;
    allowCloseWithMajorDiscrepancies: boolean; // requires approval
    requireWeightReviewForCommission: boolean;
  };
  
  // Alerts and notifications
  alertSettings: {
    enableWeightAlerts: boolean;
    alertOnOverSelling: boolean;
    alertOnUnderSelling: boolean;
    alertOnSuspiciousPatterns: boolean;
    emailAlerts: boolean;
    alertRecipients: string[];
  };
  
  // Units and display
  displaySettings: {
    defaultWeightUnit: 'kg' | 'g' | 'lb';
    decimalPlaces: number;
    showWeightInReports: boolean;
    showWeightComparison: boolean;
  };
}

export class WeightConfigurationService {
  private static instance: WeightConfigurationService;
  private static readonly STORAGE_KEY = 'weight_configuration';

  public static getInstance(): WeightConfigurationService {
    if (!WeightConfigurationService.instance) {
      WeightConfigurationService.instance = new WeightConfigurationService();
    }
    return WeightConfigurationService.instance;
  }

  /**
   * Get default weight configuration
   */
  private getDefaultConfiguration(): WeightConfiguration {
    return {
      enableWeightTracking: true,
      requireWeightForCashPurchases: true,
      requireWeightForCreditPurchases: true,
      requireWeightForCommissionItems: false, // Optional for commission items
      
      discrepancyThresholds: {
        minor: 5,    // 5%
        major: 10,   // 10%
        critical: 20 // 20%
      },
      
      tolerances: {
        minimum: 0.1, // 100g
        warning: 0.5, // 500g
        error: 1.0    // 1kg
      },
      
      billClosingSettings: {
        allowCloseWithMinorDiscrepancies: true,
        allowCloseWithMajorDiscrepancies: false,
        requireWeightReviewForCommission: true
      },
      
      alertSettings: {
        enableWeightAlerts: true,
        alertOnOverSelling: true,
        alertOnUnderSelling: true,
        alertOnSuspiciousPatterns: true,
        emailAlerts: false,
        alertRecipients: []
      },
      
      displaySettings: {
        defaultWeightUnit: 'kg',
        decimalPlaces: 2,
        showWeightInReports: true,
        showWeightComparison: true
      }
    };
  }

  /**
   * Get current weight configuration
   */
  public getConfiguration(): WeightConfiguration {
    // Weight configuration is now stored in IndexedDB via store settings
    // This method is kept for backward compatibility but returns defaults
    return this.getDefaultConfiguration();
  }

  /**
   * Update weight configuration
   */
  public updateConfiguration(updates: Partial<WeightConfiguration>): void {
    // Weight configuration updates should now go through store settings
    console.warn('Weight configuration updates should be handled through store settings');
  }

  /**
   * Reset configuration to defaults
   */
  public resetToDefaults(): void {
    // Weight configuration reset should now go through store settings
    console.warn('Weight configuration reset should be handled through store settings');
  }

  /**
   * Check if weight is required for a specific transaction type
   */
  public isWeightRequired(transactionType: 'cash' | 'credit' | 'commission'): boolean {
    const config = this.getConfiguration();
    
    switch (transactionType) {
      case 'cash':
        return config.requireWeightForCashPurchases;
      case 'credit':
        return config.requireWeightForCreditPurchases;
      case 'commission':
        return config.requireWeightForCommissionItems;
      default:
        return false;
    }
  }

  /**
   * Get discrepancy severity based on percentage
   */
  public getDiscrepancySeverity(discrepancyPercentage: number): 'none' | 'minor' | 'major' | 'critical' {
    const config = this.getConfiguration();
    const absPercentage = Math.abs(discrepancyPercentage);
    
    if (absPercentage >= config.discrepancyThresholds.critical) {
      return 'critical';
    } else if (absPercentage >= config.discrepancyThresholds.major) {
      return 'major';
    } else if (absPercentage >= config.discrepancyThresholds.minor) {
      return 'minor';
    } else {
      return 'none';
    }
  }

  /**
   * Check if a weight difference should trigger an alert
   */
  public shouldAlert(weightDifference: number, discrepancyPercentage: number): boolean {
    const config = this.getConfiguration();
    
    if (!config.alertSettings.enableWeightAlerts) {
      return false;
    }
    
    const absWeightDiff = Math.abs(weightDifference);
    const absPercentage = Math.abs(discrepancyPercentage);
    
    // Check if difference exceeds minimum threshold
    if (absWeightDiff < config.tolerances.minimum) {
      return false;
    }
    
    // Check alert conditions
    if (weightDifference < 0 && config.alertSettings.alertOnOverSelling) {
      return absPercentage >= config.discrepancyThresholds.minor;
    }
    
    if (weightDifference > 0 && config.alertSettings.alertOnUnderSelling) {
      return absPercentage >= config.discrepancyThresholds.minor;
    }
    
    return false;
  }

  /**
   * Format weight for display according to configuration
   */
  public formatWeight(weight: number): string {
    const config = this.getConfiguration();
    const formatted = weight.toFixed(config.displaySettings.decimalPlaces);
    return `${formatted}${config.displaySettings.defaultWeightUnit}`;
  }

  /**
   * Convert weight to display unit if needed
   */
  public convertToDisplayUnit(weightInKg: number): number {
    const config = this.getConfiguration();
    
    switch (config.displaySettings.defaultWeightUnit) {
      case 'g':
        return weightInKg * 1000;
      case 'lb':
        return weightInKg * 2.20462;
      case 'kg':
      default:
        return weightInKg;
    }
  }

  /**
   * Convert from display unit to kg for storage
   */
  public convertFromDisplayUnit(weight: number): number {
    const config = this.getConfiguration();
    
    switch (config.displaySettings.defaultWeightUnit) {
      case 'g':
        return weight / 1000;
      case 'lb':
        return weight / 2.20462;
      case 'kg':
      default:
        return weight;
    }
  }

  /**
   * Validate weight configuration
   */
  public validateConfiguration(config: Partial<WeightConfiguration>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (config.discrepancyThresholds) {
      const { minor, major, critical } = config.discrepancyThresholds;
      if (minor >= major) {
        errors.push('Minor threshold must be less than major threshold');
      }
      if (major >= critical) {
        errors.push('Major threshold must be less than critical threshold');
      }
      if (minor <= 0 || major <= 0 || critical <= 0) {
        errors.push('All thresholds must be positive numbers');
      }
    }
    
    if (config.tolerances) {
      const { minimum, warning, error } = config.tolerances;
      if (minimum >= warning) {
        errors.push('Minimum tolerance must be less than warning tolerance');
      }
      if (warning >= error) {
        errors.push('Warning tolerance must be less than error tolerance');
      }
      if (minimum <= 0 || warning <= 0 || error <= 0) {
        errors.push('All tolerances must be positive numbers');
      }
    }
    
    if (config.displaySettings?.decimalPlaces !== undefined) {
      if (config.displaySettings.decimalPlaces < 0 || config.displaySettings.decimalPlaces > 4) {
        errors.push('Decimal places must be between 0 and 4');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const weightConfigurationService = WeightConfigurationService.getInstance();

