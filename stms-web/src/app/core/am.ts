// Amharic text. The key is the English text shown on screen; a missing key shows English.
// {n}, {a}, {b} ... are filled in by the code.
export const AM: Record<string, string> = {
  // menu and layout
  'Stock Manager': 'የክምችት አስተዳደር',
  'Dashboard': 'ዳሽቦርድ', 'Sell': 'ሽያጭ', 'Products': 'ምርቶች', 'Sales': 'ሽያጮች', "Today's sales": 'የዛሬ ሽያጮች',
  'Loans': 'ብድሮች', 'Reports': 'ሪፖርቶች', 'Users': 'ተጠቃሚዎች', 'Settings': 'ቅንብሮች', 'Menu': 'ምናሌ', 'Log out': 'ውጣ',
  'Stock alerts': 'የክምችት ማስጠንቀቂያዎች', 'All stock levels are fine.': 'ሁሉም የክምችት መጠኖች ደህና ናቸው።', 'Open products': 'ምርቶችን ክፈት',
  'Admin': 'አስተዳዳሪ', 'Salesperson': 'ሻጭ',

  // sign in and register
  'Sign in to continue': 'ለመቀጠል ይግቡ', 'Username': 'የተጠቃሚ ስም', 'Password': 'የይለፍ ቃል', 'Sign in': 'ግባ', 'Signing in...': 'በመግባት ላይ...',
  'New salesperson?': 'አዲስ ሻጭ ነዎት?', 'Request an account': 'መለያ ይጠይቁ', 'Full name': 'ሙሉ ስም', 'Repeat password': 'የይለፍ ቃሉን ይድገሙ',
  'At least 3 characters': 'ቢያንስ 3 ፊደላት', 'At least 6 characters': 'ቢያንስ 6 ፊደላት', 'Send request': 'ጥያቄ ላክ', 'Sending...': 'በመላክ ላይ...',
  'Back to sign in': 'ወደ መግቢያ ተመለስ', 'Already approved?': 'ተፈቅዶልዎታል?',
  'The admin must approve your request before you can sign in.': 'መግባት ከመቻልዎ በፊት አስተዳዳሪው ጥያቄዎን ማጽደቅ አለበት።',
  'Enter your username and password.': 'የተጠቃሚ ስምና የይለፍ ቃል ያስገቡ።', 'Enter your full name.': 'ሙሉ ስምዎን ያስገቡ።',
  'The username needs at least 3 characters.': 'የተጠቃሚ ስሙ ቢያንስ 3 ፊደላት ሊኖረው ይገባል።',
  'The password needs at least 6 characters.': 'የይለፍ ቃሉ ቢያንስ 6 ፊደላት ሊኖረው ይገባል።',
  'The two passwords are not the same.': 'ሁለቱ የይለፍ ቃሎች አንድ አይደሉም።',
  'Wrong username or password.': 'የተጠቃሚ ስም ወይም የይለፍ ቃል ልክ አይደለም።',
  'Your account is waiting for admin approval.': 'መለያዎ የአስተዳዳሪ ፈቃድ በመጠበቅ ላይ ነው።', 'Your account is disabled.': 'መለያዎ ታግዷል።',

  // common words
  'Save': 'አስቀምጥ', 'Cancel': 'ሰርዝ', 'Close': 'ዝጋ', 'Delete': 'አጥፋ', 'Edit': 'አርም', 'Add': 'ጨምር', 'Remove': 'አስወግድ', 'Done': 'ተጠናቋል',
  'Search': 'ፈልግ', 'Show': 'አሳይ', 'Print': 'አትም', 'Details': 'ዝርዝር', 'Open': 'ክፈት', 'Yes': 'አዎ', 'No': 'አይ', 'All': 'ሁሉም',
  'Loading...': 'በመጫን ላይ...', 'Saving...': 'በማስቀመጥ ላይ...', 'Uploading...': 'በመጫን ላይ...', 'Select...': 'ይምረጡ...', 'None yet.': 'እስካሁን የለም።',
  'Previous': 'ቀዳሚ', 'Next': 'ቀጣይ', '{a}-{b} of {n}': '{a}-{b} ከ {n}', 'Page {n}': 'ገጽ {n}', 'of {n}': 'ከ {n}', '{a} of {b}': '{a} ከ {b}',
  'From': 'ከ', 'To': 'እስከ', 'to': 'እስከ', 'Date': 'ቀን', 'Status': 'ሁኔታ', 'Name': 'ስም', 'Phone': 'ስልክ', 'Role': 'ሚና', 'Reason': 'ምክንያት',
  'Total': 'ጠቅላላ', 'Subtotal': 'ንዑስ ድምር', 'Balance': 'ቀሪ ሂሳብ', 'Price': 'ዋጋ', 'Qty': 'ብዛት', 'Item': 'ዕቃ', 'Items': 'ዕቃዎች', 'Customer': 'ደንበኛ',
  'Customer:': 'ደንበኛ:', 'Invoice': 'ደረሰኝ ቁጥር', 'Sale': 'ሽያጭ', 'Loan': 'ብድር', 'Stock': 'ክምችት', 'Code': 'ኮድ', 'Cost': 'ወጪ', 'Profit': 'ትርፍ',
  'VAT': 'ተ.እ.ታ', 'VAT {n}%': 'ተ.እ.ታ {n}%', 'Approval': 'ፈቃድ', 'Active': 'ንቁ', 'Off': 'ጠፍቷል', 'Selling': 'በሽያጭ ላይ', 'Review': 'ገምግም',
  'Price + VAT': 'ዋጋ + ተ.እ.ታ', 'Rename': 'ስም ቀይር', 'Enable': 'አንቃ', 'Disable': 'አሰናክል', 'Turn on': 'አብራ', 'Turn off': 'አጥፋ',
  'Approve': 'አጽድቅ', 'Reject': 'ውድቅ አድርግ', 'Reopen': 'እንደገና ክፈት', 'Pending': 'በመጠበቅ ላይ', 'Approved': 'ጸድቋል', 'Rejected': 'ውድቅ ተደርጓል',
  'Screenshot': 'ምስል', 'Cash': 'ጥሬ ገንዘብ', 'Mobile Banking': 'የሞባይል ባንኪንግ', 'Wallet': 'ዋሌት', 'Address': 'አድራሻ', 'TIN': 'የግብር ከፋይ ቁጥር (TIN)',
  'Paid': 'ተከፍሏል', 'PartiallyPaid': 'በከፊል ተከፍሏል', 'Partially paid': 'በከፊል ተከፍሏል', 'All statuses': 'ሁሉም ሁኔታዎች',
  'Green': 'አረንጓዴ', 'Yellow': 'ቢጫ', 'Red': 'ቀይ', 'Low': 'ዝቅተኛ', 'Out of stock': 'ክምችት አልቋል', 'In stock': 'በክምችት', '{n} in stock': '{n} በክምችት',
  'requested': 'የጠየቀው', 'sales': 'ሽያጮች', 'Started': 'ጀመረ', 'Checked out': 'ወጥቷል', 'Checked out at': 'የወጡበት ሰዓት', 'Selling since': 'መሸጥ የጀመሩት',

  // dashboards
  'Today': 'ዛሬ', 'This week': 'በዚህ ሳምንት', 'This month': 'በዚህ ወር', 'This year': 'በዚህ ዓመት',
  'Total sales': 'ጠቅላላ ሽያጭ', 'Money collected': 'የተሰበሰበ ገንዘብ', 'Gross profit': 'ጥቅል ትርፍ', 'VAT charged': 'የተጠየቀ ተ.እ.ታ', 'Items sold': 'የተሸጡ ዕቃዎች',
  'Loans still owed': 'ያልተከፈሉ ብድሮች', 'cash and transfers': 'ጥሬ ገንዘብና ዝውውሮች', 'before VAT': 'ከተ.እ.ታ በፊት',
  '{n} sales': '{n} ሽያጮች', '{n} customers': '{n} ደንበኞች', '{n} customers owe': '{n} ደንበኞች ዕዳ አለባቸው', '{n} items': '{n} ዕቃዎች',
  'Sales over time': 'ሽያጭ በጊዜ', 'Collected': 'የተሰበሰበ', 'Received': 'የተቀበለ', 'Best selling products': 'በብዛት የሚሸጡ ምርቶች',
  'Money received by payment method': 'በክፍያ መንገድ የተቀበለ ገንዘብ', 'Payment method': 'የክፍያ መንገድ', 'Salespeople': 'ሻጮች',
  'No sales in this period.': 'በዚህ ጊዜ ውስጥ ሽያጭ የለም።', 'No payments in this period.': 'በዚህ ጊዜ ውስጥ ክፍያ የለም።',
  'salesperson accounts waiting for approval: {n}': 'ፈቃድ የሚጠባበቁ የሻጭ መለያዎች: {n}',
  '{p} products, {u} units, worth {v} at cost.': '{p} ምርቶች፣ {u} ዩኒቶች፣ በወጪ ዋጋ {v}።',
  "Today's sales sessions": 'የዛሬ የሽያጭ ክፍለ ጊዜዎች', 'Nobody has started selling today.': 'ዛሬ መሸጥ የጀመረ የለም።',
  'Not started. Your day starts with your first sale.': 'አልተጀመረም። ቀንዎ በመጀመሪያ ሽያጭዎ ይጀምራል።', 'New sale': 'አዲስ ሽያጭ',
  'Check out': 'ቀኑን ዝጋ', 'Sales made': 'የተደረጉ ሽያጮች', 'Loan sales': 'የብድር ሽያጮች', 'Loan payments received': 'የተቀበሉ የብድር ክፍያዎች',
  'loan sales': 'የብድር ሽያጮች', 'loan payments received': 'የተቀበሉ የብድር ክፍያዎች', 'Open loans': 'ክፍት ብድሮች',
  'All levels fine': 'ሁሉም መጠኖች ደህና ናቸው', '{a} low, {b} out of stock': '{a} ዝቅተኛ፣ {b} አልቋል',
  'Payments received today': 'ዛሬ የተቀበሉ ክፍያዎች', 'My latest sales': 'የቅርብ ጊዜ ሽያጮቼ', 'No sales yet today.': 'ዛሬ እስካሁን ሽያጭ የለም።',
  'Print receipt': 'ደረሰኝ አትም', 'Checking out...': 'ቀኑን በመዝጋት ላይ...', 'Yes, check out': 'አዎ፣ ዝጋ',
  'This ends your sales for today. You will not be able to sell again until the admin reopens your day.': 'ይህ የዛሬን ሽያጭዎን ያበቃል። አስተዳዳሪው ቀንዎን እስኪከፍት ድረስ እንደገና መሸጥ አይችሉም።',
  'Day finished': 'ቀኑ አብቅቷል', 'You are checked out. Today you made:': 'ቀኑን ዘግተዋል። ዛሬ ያደረጉት:',

  // products
  'Add product': 'ምርት ጨምር', 'Edit product': 'ምርት አርም', 'Search by name or code': 'በስም ወይም በኮድ ፈልግ', 'No products found.': 'ምንም ምርት አልተገኘም።',
  'Code (SKU)': 'ኮድ (SKU)', 'Cost price (what you paid)': 'የግዢ ዋጋ (የከፈሉት)', 'Selling price (before VAT)': 'የመሸጫ ዋጋ (ከተ.እ.ታ በፊት)',
  'Forgot password?': 'የይለፍ ቃል ረሱ?', 'Reset password': 'የይለፍ ቃል ዳግም ያዘጋጁ',
  'Choose a new password. An admin must approve the request before it takes effect.': 'አዲስ የይለፍ ቃል ይምረጡ። ከመስራቱ በፊት አስተዳዳሪ ማጽደቅ አለበት።',
  'New password': 'አዲስ የይለፍ ቃል', 'Confirm new password': 'አዲሱን የይለፍ ቃል ያረጋግጡ',
  'Send reset request': 'የዳግም ማዘጋጀት ጥያቄ ላክ', 'Sending request...': 'ጥያቄውን በመላክ ላይ...',
  'Password must be at least 8 characters.': 'የይለፍ ቃሉ ቢያንስ 8 ቁምፊዎች መሆን አለበት።', 'Passwords do not match.': 'የይለፍ ቃሎቹ አይዛመዱም።',
  'Enter your username.': 'የተጠቃሚ ስምዎን ያስገቡ።',
  'Password reset requests ({n})': 'የይለፍ ቃል ዳግም ማዘጋጀት ጥያቄዎች ({n})', 'No password reset requests.': 'የይለፍ ቃል ዳግም ማዘጋጀት ጥያቄ የለም።',
  'Approve reset': 'ዳግም ማዘጋጀቱን አጽድቅ', 'Enable alerts': 'ማሳወቂያዎችን አብራ', 'Alerts on': 'ማሳወቂያዎች በርተዋል',
  'Assigned automatically on save': 'በሚቀመጥበት ጊዜ በራስ-ሰር ይመደባል', 'Enter the product name.': 'የምርቱን ስም ያስገቡ።',
  'VAT {p}% = {v}, price with VAT = {w}': 'ተ.እ.ታ {p}% = {v}፣ ከተ.እ.ታ ጋር ዋጋ = {w}', 'Quantity in stock': 'በክምችት ያለ ብዛት',
  'Restock': 'ክምችት ጨምር', 'Adjust': 'አስተካክል', 'Adjust stock': 'ክምችት አስተካክል', 'Quantity to add': 'የሚጨመር ብዛት',
  'Change (use a minus for removing, e.g. -3)': 'ለውጥ (ለመቀነስ መቀነስ ምልክት ይጠቀሙ፣ ለምሳሌ -3)',
  'Now in stock: {n}': 'አሁን በክምችት: {n}', 'After a restock, the low-stock alert counts from the new total.': 'ክምችት ከጨመሩ በኋላ የዝቅተኛ ክምችት ማስጠንቀቂያ ከአዲሱ ድምር ይቆጥራል።',
  'Damaged or lost': 'የተበላሸ ወይም የጠፋ', 'Correction': 'እርማት', 'Delete product': 'ምርት አጥፋ',
  'Delete this product? Past sales keep their records.': 'ይህ ምርት ይጥፋ? ያለፉ ሽያጮች መዝገባቸውን ይይዛሉ።',
  'Enter the code and the name.': 'ኮዱንና ስሙን ያስገቡ።', 'Enter the selling price.': 'የመሸጫ ዋጋውን ያስገቡ።', 'The cost price cannot be negative.': 'የግዢ ዋጋ ከዜሮ በታች ሊሆን አይችልም።',
  'The quantity cannot be negative.': 'ብዛቱ ከዜሮ በታች ሊሆን አይችልም።', 'Enter a quantity above 0.': 'ከ0 በላይ ብዛት ያስገቡ።', 'Enter a change that is not 0.': '0 ያልሆነ ለውጥ ያስገቡ።',
  'A product with this SKU or name already exists.': 'ይህ ኮድ ወይም ስም ያለው ምርት አስቀድሞ አለ።',

  // selling
  'Search products by name or code': 'ምርቶችን በስም ወይም በኮድ ፈልግ', 'Loading products...': 'ምርቶች በመጫን ላይ...', 'Tap a product to add it.': 'ለመጨመር ምርት ይንኩ።',
  '{n} each': 'እያንዳንዱ {n}', 'Less': 'ቀንስ', 'More': 'ጨምር', 'Customer wants a receipt (adds {n}% VAT)': 'ደንበኛው ደረሰኝ ይፈልጋል ({n}% ተ.እ.ታ ይጨምራል)',
  'Sale type': 'የሽያጭ ዓይነት', 'Paid now': 'አሁን ተከፍሏል', 'Loan (pay later)': 'ብድር (በኋላ ይከፍላል)', 'Customer full name': 'የደንበኛው ሙሉ ስም', 'Customer phone': 'የደንበኛው ስልክ',
  'Customer pays part of it now': 'ደንበኛው ከፊሉን አሁን ይከፍላል', 'Amount to be paid later:': 'በኋላ የሚከፈል መጠን:', 'Complete sale': 'ሽያጩን አጠናቅ', 'Save loan sale': 'የብድር ሽያጩን አስቀምጥ',
  'Sale complete': 'ሽያጭ ተጠናቋል', 'Download PDF': 'PDF አውርድ', 'Loan: {a} still to be paid by {b}.': 'ብድር: {a} በ{b} መከፈል አለበት።',
  'Add at least one item.': 'ቢያንስ አንድ ዕቃ ይጨምሩ።', 'Enter the customer full name.': 'የደንበኛውን ሙሉ ስም ያስገቡ።', 'Enter the customer phone number.': 'የደንበኛውን ስልክ ቁጥር ያስገቡ።',
  'A loan must leave a balance. Turn off "pays part of it now" if it is fully paid.': 'ብድር ቀሪ ሂሳብ ሊኖረው ይገባል። ሙሉ ከተከፈለ "ከፊሉን አሁን ይከፍላል" ን ያጥፉ።',
  'Enter the payment details.': 'የክፍያ ዝርዝሩን ያስገቡ።', 'Choose how the customer paid.': 'ደንበኛው እንዴት እንደከፈለ ይምረጡ።',

  // payments
  'Bank / wallet used': 'ጥቅም ላይ የዋለ ባንክ / ዋሌት', 'Transaction reference ID': 'የግብይት ማጣቀሻ ቁጥር', 'Receipt screenshot': 'የደረሰኝ ምስል', 'Amount paid': 'የተከፈለ መጠን',
  'e.g. FT26300ABC': 'ለምሳሌ FT26300ABC', 'No banks or wallets are set up yet. Ask the admin to add them in Settings.': 'ምንም ባንክ ወይም ዋሌት አልተዘጋጀም። አስተዳዳሪው በቅንብሮች ውስጥ እንዲጨምር ይጠይቁ።',
  'Choose a payment method.': 'የክፍያ መንገድ ይምረጡ።', 'Enter the amount paid.': 'የተከፈለውን መጠን ያስገቡ።', 'Choose the bank or wallet.': 'ባንኩን ወይም ዋሌቱን ይምረጡ።',
  'Enter the transaction reference ID.': 'የግብይት ማጣቀሻ ቁጥሩን ያስገቡ።', 'Upload the receipt screenshot.': 'የደረሰኙን ምስል ይጫኑ።',

  // sales and loans
  'Search name, phone or invoice': 'በስም፣ በስልክ ወይም በደረሰኝ ፈልግ', 'No sales found.': 'ምንም ሽያጭ አልተገኘም።', 'No loans found.': 'ምንም ብድር አልተገኘም።',
  'Paid so far': 'እስካሁን የተከፈለ', 'Total to be paid': 'ጠቅላላ የሚከፈል', 'Payments': 'ክፍያዎች', 'Record a payment': 'ክፍያ መዝግብ', 'Save payment': 'ክፍያ አስቀምጥ',
  'The amount is more than the balance.': 'መጠኑ ከቀሪው ሂሳብ ይበልጣል።',

  // reports, users, settings
  'Performance': 'አፈጻጸም', 'No data.': 'ምንም መረጃ የለም።', 'Showing the first {n} of {total} rows. The PDF has all of them.': 'ከ{total} ረድፎች የመጀመሪያዎቹ {n} ይታያሉ። PDF ሁሉንም ይዟል።',
  'Waiting for approval ({n})': 'ፈቃድ በመጠበቅ ላይ ({n})', 'No requests.': 'ምንም ጥያቄ የለም።', 'All accounts': 'ሁሉም መለያዎች',
  'Company details': 'የኩባንያ ዝርዝር', 'Company name': 'የኩባንያ ስም', 'Shown on receipts and reports. VAT rate: {n}%.': 'በደረሰኞችና በሪፖርቶች ላይ ይታያል። የተ.እ.ታ መጠን: {n}%።',
  'banks / wallets': 'ባንኮች / ዋሌቶች', 'Add a name, e.g. a bank or wallet': 'ስም ይጨምሩ፣ ለምሳሌ ባንክ ወይም ዋሌት',

  // server and network messages
  'Cannot reach the server. Is the API running?': 'አገልጋዩን ማግኘት አልተቻለም። ኤፒአይው እየሰራ ነው?', 'You are not allowed to do this.': 'ይህን ለማድረግ አልተፈቀደልዎትም።',
  'Something went wrong.': 'ችግር ተከስቷል።', 'Too many requests. Please wait a moment and try again.': 'በጣም ብዙ ጥያቄዎች። እባክዎ ጥቂት ቆይተው እንደገና ይሞክሩ።'
};
