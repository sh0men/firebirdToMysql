# firebirdToMysql
Automated Table exports from multiple FireBird databases into a Mysql database

###
Firebird 3.0 Support
Firebird new wire protocol is not supported yet so for Firebird 3.0 you need to add the following in firebird.conf

AuthServer = Legacy_Auth
WireCrypt = Disabled

###
Only TEXT BLOB fields are supported! The other fields are ignored
BLOB TEXT fields will be cut to 8191 characters at the moment due to technical reasons. 

###
Indices will be created in MySQL/MariaDB, but no constraints or unique index will be generated!

###
BUG: due to a possible bug in character conversion in Firebird(I had some issues there), a function has to be created in Firebird first. Please run the attached SQL to cretae this function. If you don't need this, you have to change the index.js 


###
Usage:

Just rename the config_sample.ini and fill in the config parameters
By copying DBNAMEx.options and DBNAMEx.table sections you can export from as many databases as possible until the table names are not identhical, since only one mysql database can be used at the moment.
Not needed fields can be excluded by using DATABSENAME.donnotmigrate.TABLENAME keys

###
TAGs:
Easier access to Firebird table data since ODBC drivers are sometimes unstable.
Table export, Table import, Firebird, MySQL, MariaDB, config.ini
