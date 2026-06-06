-- Schema for HR Management Database (DMR-HR)
-- Generated to mirror MongoDB collections structure

CREATE DATABASE IF NOT EXISTS `DMR-HR`;
USE `DMR-HR`;

-- 1. tenants
CREATE TABLE IF NOT EXISTS `tenants` (
    `id` VARCHAR(100) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `domain` VARCHAR(255) NOT NULL,
    `subscription_plan` VARCHAR(50),
    `max_employees` INT DEFAULT 50,
    `billing_cycle` VARCHAR(50),
    `status` VARCHAR(50) DEFAULT 'active',
    `employee_count` INT DEFAULT 0,
    `created_at` VARCHAR(100),
    `updated_at` VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. users (Employees and Admins)
CREATE TABLE IF NOT EXISTS `users` (
    `email` VARCHAR(255) UNIQUE NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `mobile` VARCHAR(50),
    `employee_id` VARCHAR(100) PRIMARY KEY,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `tenant_id` VARCHAR(100),
    `department` VARCHAR(255),
    `designation` VARCHAR(255),
    `position` VARCHAR(255),
    `salary` DECIMAL(15, 2) DEFAULT 0.00,
    `status` VARCHAR(50) DEFAULT 'active',
    `first_login` BOOLEAN DEFAULT TRUE,
    `leave_balance` JSON,
    `bank_details` JSON,
    `biometric_pin` VARCHAR(50),
    `shift` VARCHAR(255),
    `joining_date` VARCHAR(100),
    `created_at` VARCHAR(100),
    `updated_at` VARCHAR(100),
    INDEX (`tenant_id`),
    INDEX (`role`),
    INDEX (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. departments
CREATE TABLE IF NOT EXISTS `departments` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `head` VARCHAR(255),
    `created_at` VARCHAR(100),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. designations
CREATE TABLE IF NOT EXISTS `designations` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `level` INT DEFAULT 1,
    `description` TEXT,
    `created_at` VARCHAR(100),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. shifts
CREATE TABLE IF NOT EXISTS `shifts` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `start_time` VARCHAR(20) NOT NULL,
    `end_time` VARCHAR(20) NOT NULL,
    `break_duration` INT DEFAULT 60,
    `working_hours` DECIMAL(5, 2) DEFAULT 8.00,
    `created_at` VARCHAR(100),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. salary_slabs
CREATE TABLE IF NOT EXISTS `salary_slabs` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `grade` VARCHAR(50),
    `min_salary` DECIMAL(15, 2) DEFAULT 0.00,
    `max_salary` DECIMAL(15, 2) DEFAULT 0.00,
    `basic_percentage` DECIMAL(5, 2) DEFAULT 0.00,
    `hra_percentage` DECIMAL(5, 2) DEFAULT 0.00,
    `pf_percentage` DECIMAL(5, 2) DEFAULT 0.00,
    `created_at` VARCHAR(100),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. attendance
CREATE TABLE IF NOT EXISTS `attendance` (
    `id` VARCHAR(100) PRIMARY KEY,
    `user_id` VARCHAR(100) NOT NULL,
    `user_name` VARCHAR(255),
    `tenant_id` VARCHAR(100),
    `date` VARCHAR(50) NOT NULL,
    `clock_in` VARCHAR(100),
    `clock_out` VARCHAR(100),
    `total_hours` DECIMAL(5, 2) DEFAULT 0.00,
    `status` VARCHAR(50) DEFAULT 'present',
    `note` TEXT,
    `created_at` VARCHAR(100),
    `demo` BOOLEAN DEFAULT FALSE,
    INDEX (`user_id`),
    INDEX (`tenant_id`),
    INDEX (`date`),
    INDEX (`user_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. punch_corrections
CREATE TABLE IF NOT EXISTS `punch_corrections` (
    `id` VARCHAR(100) PRIMARY KEY,
    `user_id` VARCHAR(100) NOT NULL,
    `user_name` VARCHAR(255),
    `tenant_id` VARCHAR(100),
    `date` VARCHAR(50) NOT NULL,
    `correction_type` VARCHAR(50) NOT NULL,
    `requested_time` VARCHAR(100) NOT NULL,
    `reason` TEXT,
    `status` VARCHAR(50) DEFAULT 'pending',
    `reviewed_by` VARCHAR(255),
    `reviewer_note` TEXT,
    `reviewed_at` VARCHAR(100),
    `created_at` VARCHAR(100),
    `demo` BOOLEAN DEFAULT FALSE,
    INDEX (`user_id`),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. leaves
CREATE TABLE IF NOT EXISTS `leaves` (
    `id` VARCHAR(100) PRIMARY KEY,
    `user_id` VARCHAR(100) NOT NULL,
    `user_name` VARCHAR(255),
    `tenant_id` VARCHAR(100),
    `leave_type` VARCHAR(50) NOT NULL,
    `start_date` VARCHAR(50) NOT NULL,
    `end_date` VARCHAR(50) NOT NULL,
    `days` DECIMAL(5, 2),
    `total_days` DECIMAL(5, 2),
    `reason` TEXT,
    `status` VARCHAR(50) DEFAULT 'pending',
    `reviewed_by` VARCHAR(255),
    `reviewer_note` TEXT,
    `reviewed_at` VARCHAR(100),
    `created_at` VARCHAR(100),
    `demo` BOOLEAN DEFAULT FALSE,
    INDEX (`user_id`),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. holidays
CREATE TABLE IF NOT EXISTS `holidays` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `date` VARCHAR(50) NOT NULL,
    `type` VARCHAR(50) DEFAULT 'public',
    `description` TEXT,
    `is_optional` BOOLEAN DEFAULT FALSE,
    `created_at` VARCHAR(100),
    `demo` BOOLEAN DEFAULT FALSE,
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. tax_records
CREATE TABLE IF NOT EXISTS `tax_records` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100),
    `employee_id` VARCHAR(100) NOT NULL,
    `employee_name` VARCHAR(255),
    `financial_year` VARCHAR(50),
    `regime` VARCHAR(50),
    `annual_gross` DECIMAL(15, 2) DEFAULT 0.00,
    `annual_tax` DECIMAL(15, 2) DEFAULT 0.00,
    `monthly_tds` DECIMAL(15, 2) DEFAULT 0.00,
    `monthly_gross` DECIMAL(15, 2) DEFAULT 0.00,
    `pf_employee` DECIMAL(15, 2) DEFAULT 0.00,
    `net_salary` DECIMAL(15, 2) DEFAULT 0.00,
    `status` VARCHAR(50) DEFAULT 'filed',
    `created_at` VARCHAR(100),
    `demo` BOOLEAN DEFAULT FALSE,
    INDEX (`employee_id`),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. pf_records
CREATE TABLE IF NOT EXISTS `pf_records` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100),
    `employee_id` VARCHAR(100) NOT NULL,
    `employee_name` VARCHAR(255),
    `uan_number` VARCHAR(100),
    `pf_account` VARCHAR(100),
    `monthly_basic` DECIMAL(15, 2) DEFAULT 0.00,
    `pf_wage_base` DECIMAL(15, 2) DEFAULT 0.00,
    `employee_pf` DECIMAL(15, 2) DEFAULT 0.00,
    `employer_epf` DECIMAL(15, 2) DEFAULT 0.00,
    `employer_eps` DECIMAL(15, 2) DEFAULT 0.00,
    `total_monthly` DECIMAL(15, 2) DEFAULT 0.00,
    `financial_year` VARCHAR(50),
    `status` VARCHAR(50) DEFAULT 'active',
    `created_at` VARCHAR(100),
    `demo` BOOLEAN DEFAULT FALSE,
    INDEX (`employee_id`),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. announcements
CREATE TABLE IF NOT EXISTS `announcements` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100),
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT,
    `priority` VARCHAR(50) DEFAULT 'medium',
    `created_by` VARCHAR(255),
    `created_at` VARCHAR(100),
    `demo` BOOLEAN DEFAULT FALSE,
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. performance_reviews
CREATE TABLE IF NOT EXISTS `performance_reviews` (
    `id` VARCHAR(100) PRIMARY KEY,
    `employee_id` VARCHAR(100) NOT NULL,
    `employee_name` VARCHAR(255),
    `reviewer_id` VARCHAR(100),
    `reviewer_name` VARCHAR(255),
    `tenant_id` VARCHAR(100),
    `review_period` VARCHAR(100),
    `rating` INT DEFAULT 5,
    `goals` TEXT,
    `achievements` TEXT,
    `areas_of_improvement` TEXT,
    `ai_summary` TEXT,
    `status` VARCHAR(50) DEFAULT 'submitted',
    `created_at` VARCHAR(100),
    INDEX (`employee_id`),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. job_postings
CREATE TABLE IF NOT EXISTS `job_postings` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100),
    `title` VARCHAR(255) NOT NULL,
    `department` VARCHAR(255),
    `description` TEXT,
    `requirements` TEXT,
    `location` VARCHAR(255),
    `salary_range` VARCHAR(100),
    `status` VARCHAR(50) DEFAULT 'open',
    `applicant_count` INT DEFAULT 0,
    `created_by` VARCHAR(255),
    `created_at` VARCHAR(100),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. payslips
CREATE TABLE IF NOT EXISTS `payslips` (
    `id` VARCHAR(100) PRIMARY KEY,
    `employee_id` VARCHAR(100) NOT NULL,
    `employee_name` VARCHAR(255),
    `tenant_id` VARCHAR(100),
    `month` INT NOT NULL,
    `year` INT NOT NULL,
    `financial_year` VARCHAR(50),
    `currency` VARCHAR(50) DEFAULT 'INR',
    `currency_symbol` VARCHAR(50) DEFAULT '₹',
    `basic_salary` DECIMAL(15, 2) DEFAULT 0.00,
    `hra` DECIMAL(15, 2) DEFAULT 0.00,
    `allowances` DECIMAL(15, 2) DEFAULT 0.00,
    `special_allowance` DECIMAL(15, 2) DEFAULT 0.00,
    `gross_salary` DECIMAL(15, 2) DEFAULT 0.00,
    `pf_wage` DECIMAL(15, 2) DEFAULT 0.00,
    `eps_wage` DECIMAL(15, 2) DEFAULT 0.00,
    `pf_deduction` DECIMAL(15, 2) DEFAULT 0.00,
    `employer_epf` DECIMAL(15, 2) DEFAULT 0.00,
    `employer_eps` DECIMAL(15, 2) DEFAULT 0.00,
    `edli` DECIMAL(15, 2) DEFAULT 0.00,
    `admin_charges` DECIMAL(15, 2) DEFAULT 0.00,
    `esi_applicable` BOOLEAN DEFAULT FALSE,
    `esi_employee` DECIMAL(15, 2) DEFAULT 0.00,
    `esi_employer` DECIMAL(15, 2) DEFAULT 0.00,
    `tax_regime` VARCHAR(50) DEFAULT 'new',
    `tax` DECIMAL(15, 2) DEFAULT 0.00,
    `annual_tax` DECIMAL(15, 2) DEFAULT 0.00,
    `taxable_income` DECIMAL(15, 2) DEFAULT 0.00,
    `absence_deduction` DECIMAL(15, 2) DEFAULT 0.00,
    `total_deductions` DECIMAL(15, 2) DEFAULT 0.00,
    `net_salary` DECIMAL(15, 2) DEFAULT 0.00,
    `days_worked` INT DEFAULT 30,
    `days_absent` INT DEFAULT 0,
    `department` VARCHAR(255),
    `position` VARCHAR(255),
    `status` VARCHAR(50) DEFAULT 'published',
    `created_at` VARCHAR(100),
    INDEX (`employee_id`),
    INDEX (`tenant_id`),
    INDEX (`employee_id`, `month`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. login_attempts
CREATE TABLE IF NOT EXISTS `login_attempts` (
    `identifier` VARCHAR(255) PRIMARY KEY,
    `count` INT DEFAULT 0,
    `last_attempt` VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. tax_settings
CREATE TABLE IF NOT EXISTS `tax_settings` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100),
    `financial_year` VARCHAR(50) NOT NULL,
    `default_regime` VARCHAR(50) DEFAULT 'new',
    `new_regime_slabs` JSON,
    `old_regime_slabs` JSON,
    `surcharge_slabs` JSON,
    `standard_deduction_new` DECIMAL(15, 2) DEFAULT 0.00,
    `standard_deduction_old` DECIMAL(15, 2) DEFAULT 0.00,
    `cess_rate` DECIMAL(5, 2) DEFAULT 4.00,
    `rebate_87a_limit_new` DECIMAL(15, 2) DEFAULT 0.00,
    `rebate_87a_max_new` DECIMAL(15, 2) DEFAULT 0.00,
    `rebate_87a_limit_old` DECIMAL(15, 2) DEFAULT 0.00,
    `rebate_87a_max_old` DECIMAL(15, 2) DEFAULT 0.00,
    `max_80c` DECIMAL(15, 2) DEFAULT 0.00,
    `max_80d_self` DECIMAL(15, 2) DEFAULT 0.00,
    `max_80d_parents` DECIMAL(15, 2) DEFAULT 0.00,
    `max_80ccd_1b` DECIMAL(15, 2) DEFAULT 0.00,
    `max_24_home_loan` DECIMAL(15, 2) DEFAULT 0.00,
    `created_at` VARCHAR(100),
    `updated_at` VARCHAR(100),
    UNIQUE INDEX (`tenant_id`, `financial_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. tax_declarations
CREATE TABLE IF NOT EXISTS `tax_declarations` (
    `id` VARCHAR(100) PRIMARY KEY,
    `employee_id` VARCHAR(100) NOT NULL,
    `tenant_id` VARCHAR(100),
    `financial_year` VARCHAR(50) NOT NULL,
    `regime` VARCHAR(50) DEFAULT 'new',
    `declarations` JSON,
    `status` VARCHAR(50) DEFAULT 'draft',
    `reviewed_by` VARCHAR(255),
    `reviewer_note` TEXT,
    `reviewed_at` VARCHAR(100),
    `created_at` VARCHAR(100),
    `updated_at` VARCHAR(100),
    UNIQUE INDEX (`employee_id`, `financial_year`),
    INDEX (`tenant_id`, `financial_year`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. pf_settings
CREATE TABLE IF NOT EXISTS `pf_settings` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) UNIQUE,
    `pf_rate_employee` DECIMAL(5, 2) DEFAULT 12.00,
    `pf_rate_employer` DECIMAL(5, 2) DEFAULT 12.00,
    `pf_wage_ceiling` DECIMAL(15, 2) DEFAULT 15000.00,
    `pf_apply_ceiling` BOOLEAN DEFAULT TRUE,
    `eps_wage_ceiling` DECIMAL(15, 2) DEFAULT 15000.00,
    `edli_rate` DECIMAL(5, 2) DEFAULT 0.50,
    `admin_charges_rate` DECIMAL(5, 2) DEFAULT 0.50,
    `nps_enabled` BOOLEAN DEFAULT FALSE,
    `employer_nps_rate` DECIMAL(5, 2) DEFAULT 10.00,
    `esi_enabled` BOOLEAN DEFAULT FALSE,
    `esi_employee_rate` DECIMAL(5, 2) DEFAULT 0.75,
    `esi_employer_rate` DECIMAL(5, 2) DEFAULT 3.25,
    `esi_wage_limit` DECIMAL(15, 2) DEFAULT 21000.00,
    `created_at` VARCHAR(100),
    `updated_at` VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21. biometric_devices
CREATE TABLE IF NOT EXISTS `biometric_devices` (
    `device_id` VARCHAR(100) PRIMARY KEY,
    `serial_number` VARCHAR(100) UNIQUE NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `tenant_id` VARCHAR(100),
    `status` VARCHAR(50) DEFAULT 'active',
    `online` BOOLEAN DEFAULT FALSE,
    `location` VARCHAR(255),
    `first_seen` VARCHAR(100),
    `last_ping` VARCHAR(100),
    `firmware_pushver` VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. biometric_punches
CREATE TABLE IF NOT EXISTS `biometric_punches` (
    `punch_id` VARCHAR(100) PRIMARY KEY,
    `device_sn` VARCHAR(100),
    `device_name` VARCHAR(255),
    `tenant_id` VARCHAR(100),
    `user_pin` VARCHAR(50),
    `employee_id` VARCHAR(100),
    `employee_name` VARCHAR(255),
    `timestamp` VARCHAR(100) NOT NULL,
    `status` VARCHAR(50),
    `verify_mode` VARCHAR(50),
    `source` VARCHAR(100),
    `matched` BOOLEAN DEFAULT FALSE,
    `received_at` VARCHAR(100),
    INDEX (`tenant_id`),
    INDEX (`employee_id`),
    INDEX (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 23. whatsapp_messages
CREATE TABLE IF NOT EXISTS `whatsapp_messages` (
    `message_id` VARCHAR(100) PRIMARY KEY,
    `to` VARCHAR(50) NOT NULL,
    `sent_by` VARCHAR(255),
    `tenant_id` VARCHAR(100),
    `text` TEXT,
    `type` VARCHAR(50),
    `direction` VARCHAR(50),
    `send_status` VARCHAR(50),
    `send_error` TEXT,
    `created_at` VARCHAR(100),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 24. custom_roles
CREATE TABLE IF NOT EXISTS `custom_roles` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `permissions` JSON,
    `type` VARCHAR(50) DEFAULT 'custom',
    `editable` BOOLEAN DEFAULT TRUE,
    `created_at` VARCHAR(100),
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 25. ai_conversations
CREATE TABLE IF NOT EXISTS `ai_conversations` (
    `id` VARCHAR(100) PRIMARY KEY,
    `user_id` VARCHAR(100) NOT NULL,
    `messages` JSON,
    `created_at` VARCHAR(100),
    INDEX (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 26. feedbacks
CREATE TABLE IF NOT EXISTS `feedbacks` (
    `id` VARCHAR(100) PRIMARY KEY,
    `user_id` VARCHAR(100) NOT NULL,
    `feedback_text` TEXT,
    `rating` INT,
    `created_at` VARCHAR(100),
    INDEX (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 27. biometric_raw_pushes
CREATE TABLE IF NOT EXISTS `biometric_raw_pushes` (
    `id` VARCHAR(100) PRIMARY KEY,
    `device_sn` VARCHAR(100),
    `raw_data` TEXT,
    `created_at` VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 28. biometric_commands
CREATE TABLE IF NOT EXISTS `biometric_commands` (
    `id` VARCHAR(100) PRIMARY KEY,
    `device_sn` VARCHAR(100) NOT NULL,
    `command` TEXT NOT NULL,
    `status` VARCHAR(50) DEFAULT 'pending',
    `created_at` VARCHAR(100),
    `updated_at` VARCHAR(100),
    INDEX (`device_sn`),
    INDEX (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 29. leave_types
CREATE TABLE IF NOT EXISTS `leave_types` (
    `id` VARCHAR(100) PRIMARY KEY,
    `tenant_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `days_allotted` DECIMAL(5, 2) DEFAULT 0.00,
    `description` TEXT,
    INDEX (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
