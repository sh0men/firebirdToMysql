# firebirdToMysql
Automated Table exports from multiple FireBird databases into a MySQL/MariaDB database

###
Firebird 3.0 Support
Firebird new wire protocol is not supported yet so for Firebird 3.0 you need to add the following in firebird.conf

AuthServer = Legacy_Auth

WireCrypt = Disabled

###
Only TEXT BLOB fields are supported! The other fields are ignored
BLOB TEXT fields are handled normally now, fields won't be shortened or cut anymore. 

###
The same amount of indices for the fields will be created in MySQL/MariaDB too, but no constraints or unique index will be generated!

###
No additional stored function in Firebird needed anymore.


###
Usage:

Just rename the config_sample.ini and fill in the config parameters
By copying DBNAMEx.options and DBNAMEx.table sections you can export from as many databases as possible until the table names are not identhical, since only one mysql database can be used at the moment.
Not needed fields can be excluded by using DATABASENAME.donnotmigrate.TABLENAME keys
For MySQL/MariaDB database you need to set a proper default charset, like UTF8MB4. However it should work with anything similar you have in Firebird.

###
TAGs:
Easier access to Firebird table data since ODBC drivers are sometimes unstable.
Table export, Table import, Firebird, MySQL, MariaDB, config.ini, node-firebird-dev
