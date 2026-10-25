-- Copy outside the repository and chmod 600. Replace every placeholder.
INSERT INTO organization_bootstrap
  (singleton, primary_user_id, operator, reason, trusted_alumni)
VALUES
  (1,
   'VERIFIED_PRIMARY_ACCOUNT_ID',
   'Organization-appointed operator name',
   'Organization appointment; independent identity checks completed',
   json_array());

-- With trusted alumni, replace json_array() with:
-- json_array(json_object('userId', 'VERIFIED_TRUSTED_ALUMNUS_ACCOUNT_ID', 'house', 'Komodo'))
