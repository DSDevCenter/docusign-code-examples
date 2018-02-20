const express = require('express');
const passport = require('passport');
var session = require('express-session');
var docusign = require('./src/index');

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

app.use(session({
  secret: 'secret token',
  resave: true,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

var hostUrl = 'http://' + host + ':' + port;

// Configure Passport
passport.use(new docusign.OAuthClient({
  sandbox: true,
  clientID: '{CLIENT_ID}',
  clientSecret: '{CLIENT_SECRET}',
  callbackURL: hostUrl + '/auth/callback'
},
  function (accessToken, refreshToken, user, done) {
    // Here we're just assigning the tokens to the user profile object but we
    // could be using session storage or any other form of transient-ish storage
    user.accessToken = accessToken;
    user.refreshToken = refreshToken;
    return done(null, user);
  }
));

app.get('/auth', function (req, res) {
  passport.authenticate('docusign'/*, {state: 'optional state'}*/)(req, res);
});

app.get('/auth/callback', function (req, res) {
  passport.authenticate('docusign'/*, {state: 'optional state'}*/, function (err, user) {
    if (err) {
      return res.send(err);
    }
    if (!user) {
      return res.redirect('/auth');
    }

    // getting the API client ready
    var apiClient = new docusign.ApiClient();
    // currently pointing to demo (sandbox) environment
    var RestApiUrl = 'https://demo.docusign.net/restapi';
    apiClient.setBasePath(RestApiUrl);
    console.log("Got a fresh access_token: " + user.accessToken);
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + user.accessToken);

    // creating an instance of the authentication API
    var authApi = new docusign.AuthenticationApi(apiClient);
    var loginOps = {};
    loginOps.apiPassword = 'true';
    loginOps.includeAccountIdGuid = 'true';
    // making login call. we could also use DocuSign OAuth userinfo call
    authApi.login(loginOps, function (error, loginInfo, response) {
      if (error) {
        return res.send(error);
      }
      if (loginInfo) {
        // list of user account(s)
        // note that a given user may be a member of multiple accounts
        var loginAccounts = loginInfo.loginAccounts;
        var loginAccount = loginAccounts[0];
        var baseUri = loginAccount.baseUrl;
        var accountId = loginAccount.accountId;
        var accountDomain = baseUri.split('/v2');

        // below code required for production, no effect in demo (same domain)
        apiClient.setBasePath(accountDomain[0]);
        docusign.Configuration.default.setDefaultApiClient(apiClient);
        console.log("done retrieving account info for user.");

        //******************************************************************
        //*** Common API Examples
        //*** Un-comment a sample, substitute data if needed, and run!
        //******************************************************************

        // Embedded signing example (create Recipient View)
        // return res.send( embeddedSigning(accountId) );

        // create a new envelope and send the response back
        // return res.send( createEnvelope(accountId) );

        // create a new envelope from template
        // return res.send( createEnvelopeFromTemplate(accountId) );

        // Embedded sending example (create Sender View)
        // return res.send( embeddedSending(accountId) );

        // Embedded DS Console view (create Console view)
        // return res.send( createConsoleView(accountId) );

        // get multiple envelope statuses (polling)
        // return res.send( getMultipleEnvelopeStatuses(accountId) );

        // get multiple envelope statuses (polling)
        // return res.send( getEnvelopeStatus(accountId, "[ENVELOPE_ID]") );

        // list envelope recipients (polling)
        // return res.send( getEnvelopeStatus(accountId, "[ENVELOPE_ID]") );

        // download all envelope documents
        // return res.send( downloadEnvelopeDocuments(accountId, "[ENVELOPE_ID]") );
      }
    });
  })(req, res);
});

/////////////////////////////////////////////////////////////////////////////////
function createEnvelope(accountId) {

  // create a byte array that will hold our document bytes
  var fileBytes = null;
  try {
    var fs = require('fs');
    var path = require('path');
    // read file from a local directory
    fileBytes = fs.readFileSync(path.resolve(__dirname, "test.pdf"));
    // fileBytes = fs.readFileSync(path.resolve(__dirname, "[PATH/TO/DOCUMENT]"));
  } catch (ex) {
    // handle error
    console.log('Exception: ' + ex);
  }

  // create an envelope that will store the document(s), field(s), and recipient(s)
  var envDef = new docusign.EnvelopeDefinition();
  envDef.emailSubject = 'Please sign this document sent from Node SDK';

  // add a document to the envelope
  var doc = new docusign.Document();
  var base64Doc = new Buffer(fileBytes).toString('base64');
  doc.documentBase64 = base64Doc;
  doc.name = 'TestFile.pdf'; // can be different from actual file name
  doc.extension = 'pdf';
  doc.documentId = '1';

  var docs = [];
  docs.push(doc);
  envDef.documents = docs;

  // add a recipient to sign the document, identified by name and email we used above
  var signer = new docusign.Signer();
  signer.email = '{USER_EMAIL}';
  signer.name = '{USER_NAME}';
  signer.recipientId = '1';

  // create a signHere tab 100 pixels down and 150 right from the top left
  // corner of first page of document
  var signHere = new docusign.SignHere();
  signHere.documentId = '1';
  signHere.pageNumber = '1';
  signHere.recipientId = '1';
  signHere.xPosition = '100';
  signHere.yPosition = '150';

  // can have multiple tabs, so need to add to envelope as a single element list
  var signHereTabs = [];
  signHereTabs.push(signHere);
  var tabs = new docusign.Tabs();
  tabs.signHereTabs = signHereTabs;
  signer.tabs = tabs;

  // add recipients (in this case a single signer) to the envelope
  envDef.recipients = new docusign.Recipients();
  envDef.recipients.signers = [];
  envDef.recipients.signers.push(signer);

  // send the envelope by setting |status| to "sent". To save as a draft set to "created"
  envDef.status = 'sent';

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();

  // call the createEnvelope() API to create and send the envelope
  envelopesApi.createEnvelope(accountId, {'envelopeDefinition': envDef}, function (err, envelopeSummary, response) {
    if (err) {
      return next(err);
    }
    console.log('EnvelopeSummary: ' + JSON.stringify(envelopeSummary));
    return JSON.stringify(envelopeSummary);
  });
}

/////////////////////////////////////////////////////////////////////////////////
function createEnvelopeFromTemplate (accountId) {
    // create a new envelope object that we will manage the signature request through
    var envDef = new docusign.EnvelopeDefinition();
    envDef.emailSubject = 'Please sign this document sent from Node SDK';
    envDef.templateId = '{TEMPLATE_ID}';

    // create a template role with a valid templateId and roleName and assign signer info
    var tRole = new docusign.TemplateRole();
    tRole.roleName = '{ROLE}';
    tRole.name = '{USER_NAME}';
    tRole.email = '{USER_EMAIL}';

    // create a list of template roles and add our newly created role
    var templateRolesList = [];
    templateRolesList.push(tRole);

    // assign template role(s) to the envelope
    envDef.templateRoles = templateRolesList;

    // send the envelope by setting |status| to 'sent'. To save as a draft set to 'created'
    envDef.status = 'sent';

    // use the |accountId| we retrieved through the Login API to create the Envelope
    var accountId = accountId;

    // instantiate a new EnvelopesApi object
    var envelopesApi = new docusign.EnvelopesApi();

    // call the createEnvelope() API
    envelopesApi.createEnvelope(accountId, {'envelopeDefinition': envDef}, function (err, envelopeSummary, response) {
      if (err) {
        return next(err);
      }
      console.log('EnvelopeSummary: ' + JSON.stringify(envelopeSummary));
      return JSON.stringify(envelopeSummary);
    });
  }

/////////////////////////////////////////////////////////////////////////////////
function embeddedSigning(accountId) {

  // API workflow contains two API requests: 
  // 1) create envelope with an embedded recipient
  // 2) create the recipient view (signing URL)

  // create a byte array that will hold our document bytes
  var fileBytes = null;
  try {
    var fs = require('fs');
    var path = require('path');
    // read file from a local directory
    fileBytes = fs.readFileSync(path.resolve(__dirname, "test.pdf"));
    // fileBytes = fs.readFileSync(path.resolve(__dirname, "[PATH/TO/DOCUMENT]"));
  } catch (ex) {
    // handle error
    console.log('Exception: ' + ex);
  }

  // create an envelope that will store the document(s), field(s), and recipient(s)
  var envDef = new docusign.EnvelopeDefinition();
  envDef.emailSubject = 'Please sign this document sent from Node SDK';

  // add a document to the envelope
  var doc = new docusign.Document();
  var base64Doc = new Buffer(fileBytes).toString('base64');
  doc.documentBase64 = base64Doc;
  doc.name = 'TestFile.pdf'; // can be different from actual file name
  doc.extension = 'pdf';
  doc.documentId = '1';

  var docs = [];
  docs.push(doc);
  envDef.documents = docs;

  // add a recipient to sign the document, identified by name and email we used above
  var signer = new docusign.Signer();
  signer.email = '{USER_EMAIL}';
  signer.name = '{USER_NAME}';
  signer.recipientId = '1';

  //*** important: must set the clientUserId property to embed the recipient!
  // otherwise DocuSign platform will treat recipient as remote and your
  // integration will not be able to generate a signing token for the recipient
  signer.clientUserId = '1001';

  // create a signHere tab 100 pixels down and 150 right from the top left
  // corner of first page of document
  var signHere = new docusign.SignHere();
  signHere.documentId = '1';
  signHere.pageNumber = '1';
  signHere.recipientId = '1';
  signHere.xPosition = '100';
  signHere.yPosition = '150';

  // can have multiple tabs, so need to add to envelope as a single element list
  var signHereTabs = [];
  signHereTabs.push(signHere);
  var tabs = new docusign.Tabs();
  tabs.signHereTabs = signHereTabs;
  signer.tabs = tabs;

  // add recipients (in this case a single signer) to the envelope
  envDef.recipients = new docusign.Recipients();
  envDef.recipients.signers = [];
  envDef.recipients.signers.push(signer);

  // send the envelope by setting |status| to "sent". To save as a draft set to "created"
  envDef.status = 'sent';

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();

  // call the createEnvelope() API to create and send the envelope
  envelopesApi.createEnvelope(accountId, {'envelopeDefinition': envDef}, function (err, envelopeSummary, response) {
    if (err) {
      return next(err);
    }
    console.log('EnvelopeSummary: ' + JSON.stringify(envelopeSummary));

    // ***
    // Once the envelope call createRecipientView() to generate the signing URL!
    // ***
    return createRecipientView(accountId, envelopeSummary.envelopeId);
  });
}

/////////////////////////////////////////////////////////////////////////////////
function createRecipientView(accountId, envelopeId) {

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();

  // set the url where you want the recipient to go once they are done signing
  // should typically be a callback route somewhere in your app
  var viewRequest = new docusign.RecipientViewRequest();
  viewRequest.returnUrl = 'https://www.docusign.com/';
  viewRequest.authenticationMethod = 'email';

  // recipient information must match embedded recipient info we provided in step #2
  viewRequest.email = '{USER_EMAIL}';
  viewRequest.userName = '{USER_NAME}';
  viewRequest.recipientId = '1';
  viewRequest.clientUserId = '1001';

  // call the CreateRecipientView API
  envelopesApi.createRecipientView(accountId, envelopeId, {'recipientViewRequest': viewRequest}, function (error, recipientView, response) {
    if (error) {
      console.log('Error: ' + error);
      return;
    }

    if (recipientView) {
      console.log('ViewUrl: ' + JSON.stringify(recipientView));
    }
    return JSON.stringify(recipientView);
  });
}

/////////////////////////////////////////////////////////////////////////////////
function embeddedSending(accountId) {

  // API workflow contains two API requests: 
  // 1) create a draft envelope
  // 2) create the sender view (sending URL)

  // create a byte array that will hold our document bytes
  var fileBytes = null;
  try {
    var fs = require('fs');
    var path = require('path');
    // read file from a local directory
    fileBytes = fs.readFileSync(path.resolve(__dirname, "test.pdf"));
    // fileBytes = fs.readFileSync(path.resolve(__dirname, "[PATH/TO/DOCUMENT]"));
  } catch (ex) {
    // handle error
    console.log('Exception: ' + ex);
  }

  // create an envelope that will store the document(s), field(s), and recipient(s)
  var envDef = new docusign.EnvelopeDefinition();
  envDef.emailSubject = 'Please sign this document sent from Node SDK';

  // add a document to the envelope
  var doc = new docusign.Document();
  var base64Doc = new Buffer(fileBytes).toString('base64');
  doc.documentBase64 = base64Doc;
  doc.name = 'TestFile.pdf'; // can be different from actual file name
  doc.extension = 'pdf';
  doc.documentId = '1';

  var docs = [];
  docs.push(doc);
  envDef.documents = docs;

  // add a recipient to sign the document, identified by name and email we used above
  var signer = new docusign.Signer();
  signer.email = '{USER_EMAIL}';
  signer.name = '{USER_NAME}';
  signer.recipientId = '1';

  // create a signHere tab 100 pixels down and 150 right from the top left
  // corner of first page of document
  var signHere = new docusign.SignHere();
  signHere.documentId = '1';
  signHere.pageNumber = '1';
  signHere.recipientId = '1';
  signHere.xPosition = '100';
  signHere.yPosition = '150';

  // can have multiple tabs, so need to add to envelope as a single element list
  var signHereTabs = [];
  signHereTabs.push(signHere);
  var tabs = new docusign.Tabs();
  tabs.signHereTabs = signHereTabs;
  signer.tabs = tabs;

  // add recipients (in this case a single signer) to the envelope
  envDef.recipients = new docusign.Recipients();
  envDef.recipients.signers = [];
  envDef.recipients.signers.push(signer);

  //*** must set to "created" status so we can open the tag and send view of the envelope
  envDef.status = 'created';

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();

  // call the createEnvelope() API to create and send the envelope
  envelopesApi.createEnvelope(accountId, {'envelopeDefinition': envDef}, function (err, envelopeSummary, response) {
    if (err) {
      return next(err);
    }
    console.log('EnvelopeSummary: ' + JSON.stringify(envelopeSummary));

    // ***
    // Once the envelope call createRecipientView() to generate the signing URL!
    // ***
    return createSenderView(accountId, envelopeSummary.envelopeId);
  });
}

/////////////////////////////////////////////////////////////////////////////////
function createSenderView(accountId, envelopeId) {

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();

  // set the url where you want the recipient to go once they are done signing
  // should typically be a callback route somewhere in your app
  var viewRequest = new docusign.ReturnUrlRequest();
  viewRequest.returnUrl = 'https://www.docusign.com/';

  // call the CreateRecipientView API
  envelopesApi.createSenderView(accountId, envelopeId, {'returnUrlRequest': viewRequest}, function (error, senderView, response) {
    if (error) {
      console.log('Error: ' + error);
      return;
    }

    if (senderView) {
      console.log('ViewUrl: ' + JSON.stringify(senderView));
    }
    return JSON.stringify(senderView);
  });
}

/////////////////////////////////////////////////////////////////////////////////
function createConsoleView(accountId) {

  // instantiate a new EnvelopesApi and consoleViewRequest objects
  var envelopesApi = new docusign.EnvelopesApi();
  var viewRequest = new docusign.ConsoleViewRequest();
  viewRequest.returnUrl = 'https://www.docusign.com/';

  // call the CreateConsoleView API
  envelopesApi.createConsoleView(accountId, {'consoleViewRequest': viewRequest}, function (error, consoleView, response) {
    if (error) {
      console.log('Error: ' + error);
      return;
    }

    if (consoleView) {
      console.log('ViewUrl: ' + JSON.stringify(consoleView));
    }
    return JSON.stringify(consoleView);
  });
}

/////////////////////////////////////////////////////////////////////////////////
function getMultipleEnvelopeStatuses(accountId) {

  // instantiate a new EnvelopesApi
  var envelopesApi = new docusign.EnvelopesApi();

  // the list status changes call requires at least a from_date OR
  // a set of envelopeIds. here we filter using a from_date
  var options = {};
  
  // set from date to filter envelopes (ex: Jan 15, 2018)
  options.fromDate = '2018/15/01';

  // call the listStatusChanges() API
  envelopesApi.listStatusChanges(accountId, options, function (error, envelopes, response) {
    if (error) {
      console.log('Error: ' + error);
      return;
    }
  
    if (envelopes) {
      console.log('EnvelopesInformation: ' + JSON.stringify(envelopes));
    }
  });
}

/////////////////////////////////////////////////////////////////////////////////
function getEnvelopeStatus(accountId, envelopeId) {

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();
  
  // call the getEnvelope() API
  envelopesApi.getEnvelope(accountId, envelopeId, null, function (error, env, response) {
    if (error) {
      console.log('Error: ' + error);
      return;
    }
  
    if (env) {
      console.log('Envelope: ' + JSON.stringify(env));
    }
    return env;
  });
}
/////////////////////////////////////////////////////////////////////////////////
function listEnvelopeRecipients(accountId, envelopeId) {

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();
  
  // call the listRecipients() API
  envelopesApi.listRecipients(accountId, envelopeId, null, function (error, recips, response) {
    if (error) {
      console.log('Error: ' + error);
      return;
    }
    if (recips) {
      console.log('Recipients: ' + JSON.stringify(recips));
    }
    return recips;
  });
}
/////////////////////////////////////////////////////////////////////////////////
function downloadEnvelopeDocuments(accountId, envelopeId) {

  // API workflow contains two API requests: 
  // 1) list envelope documents API
  // 2) get document API (for each doc)

  // instantiate a new EnvelopesApi object
  var envelopesApi = new docusign.EnvelopesApi();
  
  // call the listDocuments() API
  envelopesApi.listDocuments(accountId, envelopeId, null, function (error, docsList, response) {
    if (error) {
      console.log('Error: ' + error);
      return;
    }
    if (docsList) {
      console.log('Envelope Documents: ' + JSON.stringify(docsList));
      
      // instantiate a new EnvelopesApi object
      var envelopesApi = new docusign.EnvelopesApi();
      
      // **********************************************************
      // Loop through the envelope documents and download each one.
      // **********************************************************
      for (var i = 0; i < docsList.envelopeDocuments.length; i++) {
        var documentId = docsList.envelopeDocuments[i].documentId;
        // call the getDocument() API
        envelopesApi.getDocument(accountId, envelopeId, documentId, null, function (error, document, response) {
          if (error) {
            console.log('Error: ' + error);
            return;
          }
          if (document) {
            try {
              var fs = require('fs');
              var path = require('path');
              // download the document pdf
              var filename = envelopeId + '_' + documentId + '.pdf';
              var tempFile = path.resolve(__dirname, filename);
              fs.writeFile(tempFile, new Buffer(document, 'binary'), function (err) {
                if (err) console.log('Error: ' + err);
              });
              console.log('Document ' + documentId + ' from envelope ' + envelopeId + ' has been downloaded to:\n' + tempFile);
            } catch (ex) {
              console.log('Exception: ' + ex);
            }
          }
        });
      }
    }
  });
}

/////////////////////////////////////////////////////////////////////////////////
app.listen(port, host, function (err) {
  if (err) {
    throw err;
  }

  console.log('Server running on http://' + host + ':' + port + '. Open following link to begin the authorization process: \n');
  console.log('http://' + host + ':' + port + '/auth');
});