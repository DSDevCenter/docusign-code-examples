using DocuSign.eSign.Api;
using DocuSign.eSign.Client;
using DocuSign.eSign.Model;
using Microsoft.Owin.Hosting;
using Newtonsoft.Json;
using Owin;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Web.Http;

namespace SdkTests
{
    // This OAuthFlowTests class demostrates the DocuSign OAuth2 Authorization Code grant flow. Other API
    // authentication methods are available including JWT auth.

    // Prerequisites - Register your Application in the Docusign Admin console
    // Add an application: 
    //  1. Make note of the integrator key (client_id below);
    //  2. Set a client Secret (client_secret below);
    //  3. Set a callback Url (redirect_uri below).

    // The steps for the auth code grant flow are:
    // 1. Initiate a browser session to the DocuSign OAuth auth endpoint including the client_id and redirect_uri
    // 2. DocuSign presents a login page in the browser;
    // 3. The user enters their credentials into the login page;
    // 4. DocuSign authenticates the user and redirects the browser to the specified redirect_uri with a code;
    // 5. Your application exchanges the code for an access_token using DocuSign OAuth token endpoint;
    // 6. The access_token and a refresh_token are returned;
    // 7. The application uses the access_token to make API calls to the REST API. The refresh_token may 
    //    be stored away and used to retrieve a new access_token when the token expires.

    public class CSharpSDKSamples
    {
        // Point to DocuSign Demo (sandbox) environment for requests
        public const string RestApiUrl = "https://demo.docusign.net/restapi";

        // These items are all registered at the DocuSign Admin console and are required 
        // to perform the OAuth flow.
        public const string client_id = "{CLIENT_ID}";
        public const string client_secret = "{CLIENT_SECRET}";
        public const string redirect_uri = "{REDIRECT_URI}";

        // This is an application-speicifc param that may be passed around during the OAuth
        // flow. It allows the app to track its flow, in addition to more security.
        public const string stateOptional = "testState";

        // This will be returned to the test via the callback url after the
        // user authenticates via the browser.
        public static string AccessCode { get; internal set; }

        // This will be filled in with the access_token retrieved from the token endpoint using the code above.
        // This is the Bearer token that will be used to make API calls.
        public static string AccessToken { get; set; }
        public static string StateValue { get; internal set; }

        public static string AccountId { get; set; }
        public static string BaseUri { get; set; }

        // This event handle is used to block the self-hosted Web service in the test
        // until the OAuth login is completed.
        public static ManualResetEvent WaitForCallbackEvent = null;

        // main entry method
        static void Main(String[] args)
        {
            /////////////////////////////////////////////////////////////////
            // Run Code Samples        
            /////////////////////////////////////////////////////////////////
            CSharpSDKSamples samples = new CSharpSDKSamples();

            // first we use the OAuth authorization code grant to get an API access_token
            samples.OAuthAuthorizationCodeFlowTest();

            // un-comment a sample to run the workflow
            //samples.createEnvelope(AccountId);

            // create envelope with an embedded recipient 
            //EnvelopeSummary result = samples.createEnvelopeWithEmbeddedRecipient(AccountId);

            // create envelope then generate signing URL (recipient view)
            //EnvelopeSummary result = samples.createEnvelopeWithEmbeddedRecipient(AccountId);
            //samples.EmbeddedSigning(AccountId, result.EnvelopeId);

            // embed the tag and sender view (embedded sender view)
            //samples.EmbeddedSenderView(AccountId, "envelopeId_of_a_draft_envelope");

            // create envelope then generate signing URL (recipient view)
            //samples.EmbeddedConsoleView(AccountId);

            // list multiple envelope statues
            //samples.ListEnvelopes(AccountId);

            // get envelope status and information
            //samples.GetEnvelope(AccountId, "enter_an_envelope_id");

            // list envelope recipients
            //samples.ListRecipients(AccountId, "enter_an_envelope_id");

            // list and download all envelope documents
            //EnvelopeDocumentsResult docsList = samples.ListEnvelopeDocuments(AccountId, "enter_an_envelope_id");
            //samples.DownloadEnvelopeDocuments(AccountId, docsList);
        }

        public void OAuthAuthorizationCodeFlowTest()
        {

            // Make an API call with the token
            ApiClient apiClient = new ApiClient(RestApiUrl);
            DocuSign.eSign.Client.Configuration.Default.ApiClient = apiClient;

            // Initiate the browser session to the Authentication server
            // so the user can login.
            string accountServerAuthUrl = apiClient.GetAuthorizationUri(client_id, redirect_uri, true, stateOptional);
            System.Diagnostics.Process.Start(accountServerAuthUrl);

            WaitForCallbackEvent = new ManualResetEvent(false);

            // Launch a self-hosted web server to accepte the redirect_uri call
            // after the user finishes authentication.
            using (WebApp.Start<Startup>("http://localhost:3000"))
            {
                Trace.WriteLine("WebServer Running. Waiting for access_token...");

                // This waits for the redirect_uri to be received in the REST controller
                // (see classes below) and then sleeps a short time to allow the response
                // to be returned to the web browser before the server session ends.
                WaitForCallbackEvent.WaitOne(60000, false);
                Thread.Sleep(1000);
            }

            string accessToken = apiClient.GetOAuthToken(client_id, client_secret, true, AccessCode);
            Trace.WriteLine("Access_token: " + accessToken);

            /////////////////////////////////////////////////////////////////
            // STEP 1: Get Base URI and Account ID        
            /////////////////////////////////////////////////////////////////

            // login call is available in the authentication api 
            AuthenticationApi authApi = new AuthenticationApi();
            LoginInformation loginInfo = authApi.Login();

            // parse the first account ID that is returned (user might belong to multiple accounts)
            AccountId = loginInfo.LoginAccounts[0].AccountId;
            BaseUri = loginInfo.LoginAccounts[0].BaseUrl;

            Trace.WriteLine("accountId: " + AccountId);
            Trace.WriteLine("base_uri: " + BaseUri);
        }

        public EnvelopeSummary createEnvelope(string accountId)
        {
            // Read a file from disk to use as a document.
            byte[] fileBytes = File.ReadAllBytes("test.pdf");

            EnvelopeDefinition envDef = new EnvelopeDefinition();
            envDef.EmailSubject = "[DocuSign C# SDK] - Please sign this doc";

            // Add a document to the envelope
            Document doc = new Document();
            doc.DocumentBase64 = System.Convert.ToBase64String(fileBytes);
            doc.Name = "TestFile.pdf";
            doc.DocumentId = "1";

            envDef.Documents = new List<Document>();
            envDef.Documents.Add(doc);

            // Add a recipient to sign the documeent
            Signer signer = new Signer();
            signer.Email = "{USER_EMAIL}";
            signer.Name = "{USER_NAME}";
            signer.RecipientId = "1";

            // Create a |SignHere| tab somewhere on the document for the recipient to sign
            signer.Tabs = new Tabs();
            signer.Tabs.SignHereTabs = new List<SignHere>();
            SignHere signHere = new SignHere();
            signHere.DocumentId = "1";
            signHere.PageNumber = "1";
            signHere.RecipientId = "1";
            signHere.XPosition = "100";
            signHere.YPosition = "150";
            signer.Tabs.SignHereTabs.Add(signHere);

            envDef.Recipients = new Recipients();
            envDef.Recipients.Signers = new List<Signer>();
            envDef.Recipients.Signers.Add(signer);

            // set envelope status to "sent" to immediately send the signature request
            envDef.Status = "sent";

            // |EnvelopesApi| contains methods related to creating and sending Envelopes (aka signature requests)
            EnvelopesApi envelopesApi = new EnvelopesApi();
            EnvelopeSummary envelopeSummary = envelopesApi.CreateEnvelope(accountId, envDef);

            // print the JSON response
            Trace.WriteLine("EnvelopeSummary:\n" + JsonConvert.SerializeObject(envelopeSummary));
            Trace.WriteLine("Envelope has been sent to " + signer.Email);
            return envelopeSummary;
        }

        public EnvelopeSummary createEnvelopeFromTemplate(string accountId)
        {
            EnvelopeDefinition envDef = new EnvelopeDefinition();
            envDef.EmailSubject = "[DocuSign C# SDK] - Please sign this doc";

            // assign recipient to template role by setting name, email, and role name.  Note that the
            // template role name must match the placeholder role name saved in your account template.  
            TemplateRole tRole = new TemplateRole();
            tRole.Email = "{USER_EMAIL}";
            tRole.Name = "{USER_NAME}";
            tRole.RoleName = "{ROLE}";

            List<TemplateRole> rolesList = new List<TemplateRole>() { tRole };

            // add the role to the envelope and assign valid templateId from your account
            envDef.TemplateRoles = rolesList;
            envDef.TemplateId = "{TEMPLATE_ID}";

            // set envelope status to "sent" to immediately send the signature request
            envDef.Status = "sent";

            // |EnvelopesApi| contains methods related to creating and sending Envelopes (aka signature requests)
            EnvelopesApi envelopesApi = new EnvelopesApi();
            EnvelopeSummary envelopeSummary = envelopesApi.CreateEnvelope(accountId, envDef);

            // print the JSON response
            Console.WriteLine("EnvelopeSummary:\n{0}", JsonConvert.SerializeObject(envelopeSummary));
            Trace.WriteLine("Envelope has been sent to " + tRole.Email);
            return envelopeSummary;
        }

        public EnvelopeSummary createEnvelopeWithEmbeddedRecipient(string accountId)
        {
            // Read a file from disk to use as a document.
            byte[] fileBytes = File.ReadAllBytes("test.pdf");

            EnvelopeDefinition envDef = new EnvelopeDefinition();
            envDef.EmailSubject = "[DocuSign C# SDK] - Please sign this doc";

            // Add a document to the envelope
            Document doc = new Document();
            doc.DocumentBase64 = System.Convert.ToBase64String(fileBytes);
            doc.Name = "TestFile.pdf";
            doc.DocumentId = "1";

            envDef.Documents = new List<Document>();
            envDef.Documents.Add(doc);

            // Add a recipient to sign the documeent
            Signer signer = new Signer();
            signer.Email = "{USER_EMAIL}";
            signer.Name = "{USER_NAME}";
            signer.RecipientId = "1";
            signer.ClientUserId = "1001";

            // Create a |SignHere| tab somewhere on the document for the recipient to sign
            signer.Tabs = new Tabs();
            signer.Tabs.SignHereTabs = new List<SignHere>();
            SignHere signHere = new SignHere();
            signHere.DocumentId = "1";
            signHere.PageNumber = "1";
            signHere.RecipientId = "1";
            signHere.XPosition = "100";
            signHere.YPosition = "150";
            signer.Tabs.SignHereTabs.Add(signHere);

            envDef.Recipients = new Recipients();
            envDef.Recipients.Signers = new List<Signer>();
            envDef.Recipients.Signers.Add(signer);

            // set envelope status to "sent" to immediately send the signature request
            envDef.Status = "sent";

            // |EnvelopesApi| contains methods related to creating and sending Envelopes (aka signature requests)
            EnvelopesApi envelopesApi = new EnvelopesApi();
            EnvelopeSummary envelopeSummary = envelopesApi.CreateEnvelope(accountId, envDef);

            // print the JSON response
            Trace.WriteLine("EnvelopeSummary:\n" + JsonConvert.SerializeObject(envelopeSummary));
            Trace.WriteLine("Envelope with embedded recipient created and sent.");
            return envelopeSummary;
        }

        public ViewUrl EmbeddedSigning(String accountId, String envelopeId)
        {
            RecipientViewRequest viewOptions = new RecipientViewRequest()
            {
                ReturnUrl = "https://www.docusign.com/",
                ClientUserId = "1001",  // must match clientUserId of the embedded recipient
                AuthenticationMethod = "email",
                UserName = "{USER_NAME}",
                Email = "{USER_EMAIL}"
            };

            // instantiate an envelopesApi object
            EnvelopesApi envelopesApi = new EnvelopesApi();

            // create the recipient view (aka signing URL)
            ViewUrl recipientView = envelopesApi.CreateRecipientView(accountId, envelopeId, viewOptions);

            // print the JSON response
            Console.WriteLine("ViewUrl:\n{0}", JsonConvert.SerializeObject(recipientView));
            Trace.WriteLine("ViewUrl:\n{0}", JsonConvert.SerializeObject(recipientView));

            // Start the embedded signing session
            System.Diagnostics.Process.Start(recipientView.Url);

            return recipientView;
        }

        public ViewUrl EmbeddedSenderView(String accountId, String envelopeId)
        {
            ReturnUrlRequest options = new ReturnUrlRequest();
            options.ReturnUrl = "https://www.docusign.com";

            // instantiate an envelopesApi object
            EnvelopesApi envelopesApi = new EnvelopesApi();

            // generate the embedded sending URL
            ViewUrl senderView = envelopesApi.CreateSenderView(accountId, envelopeId, options);

            // print the JSON response
            Console.WriteLine("ViewUrl:\n{0}", JsonConvert.SerializeObject(senderView));

            // Start the embedded sending session
            System.Diagnostics.Process.Start(senderView.Url);

            return senderView;
        }

        public ViewUrl EmbeddedConsoleView(String accountId)
        {
            ReturnUrlRequest urlRequest = new ReturnUrlRequest();
            urlRequest.ReturnUrl = "https://www.docusign.com";

            // Adding the envelopeId start sthe console with the envelope open
            EnvelopesApi envelopesApi = new EnvelopesApi();
            ViewUrl viewUrl = envelopesApi.CreateConsoleView(accountId, null);

            // Start the embedded signing session.
            System.Diagnostics.Process.Start(viewUrl.Url);

            return viewUrl;
        }

        public EnvelopesInformation ListEnvelopes(String accountId)
        {
            // This example gets statuses of all envelopes in your account going back 1 full month...
            DateTime fromDate = DateTime.UtcNow;
            fromDate = fromDate.AddDays(-30);
            string fromDateStr = fromDate.ToString("o");

            // set a filter for the envelopes we want returned using the fromDate and count properties
            EnvelopesApi.ListStatusChangesOptions options = new EnvelopesApi.ListStatusChangesOptions()
            {
                count = "10",
                fromDate = fromDateStr
            };

            // |EnvelopesApi| contains methods related to envelopes and envelope recipients
            EnvelopesApi envelopesApi = new EnvelopesApi();
            EnvelopesInformation envelopes = envelopesApi.ListStatusChanges(accountId, options);
            Trace.WriteLine("EnvelopesInformation: " + envelopes);
            return envelopes;
        }

        public Envelope GetEnvelope(String accountId, String envelopeId)
        {
            EnvelopesApi envelopesApi = new EnvelopesApi();
            Envelope envInfo = envelopesApi.GetEnvelope(accountId, envelopeId);

            // print the JSON response
            Console.WriteLine("EnvelopeInformation:\n{0}", JsonConvert.SerializeObject(envInfo));
            return envInfo;
        }

        public Recipients ListRecipients(String accountId, String envelopeId)
        {
            EnvelopesApi envelopesApi = new EnvelopesApi();
            Recipients recips = envelopesApi.ListRecipients(accountId, envelopeId);

            // print the JSON response
            Console.WriteLine("Recipients:\n{0}", JsonConvert.SerializeObject(recips));
            return recips;
        }

        public EnvelopeDocumentsResult ListEnvelopeDocuments(String accountId, String envelopeId)
        {
            EnvelopesApi envelopesApi = new EnvelopesApi();
            EnvelopeDocumentsResult docsList = envelopesApi.ListDocuments(accountId, envelopeId);

            // print the JSON response
            Console.WriteLine("EnvelopeDocumentsResult:\n{0}", JsonConvert.SerializeObject(docsList));

            return docsList;
        }

        public void DownloadEnvelopeDocuments(String accountId, EnvelopeDocumentsResult docsList)
        {
            EnvelopesApi envelopesApi = new EnvelopesApi();
            String filePath = String.Empty;
            FileStream fs = null;

            for (int i = 0; i < docsList.EnvelopeDocuments.Count; i++ ) 
            {
                // GetDocument() API call returns a MemoryStream
                MemoryStream docStream = (MemoryStream)envelopesApi.GetDocument(accountId, docsList.EnvelopeId, docsList.EnvelopeDocuments[i].DocumentId);
                // let's save the document to local file system
                filePath = Path.GetTempPath() + Path.GetRandomFileName() + ".pdf";
                fs = new FileStream(filePath, FileMode.Create);
                docStream.Seek(0, SeekOrigin.Begin);
                docStream.CopyTo(fs);
                fs.Close();
                Console.WriteLine("Envelope Document {0} has been downloaded to:  {1}", i, filePath);
            }
        }
    } // end class

    // Configuration for self-hosted Web service. THis allows the test to call out to the
    // Account Server endponts and have the resulting browser login session redirect
    // directly into this test.
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            // Configure Web API for self-host. 
            var config = new HttpConfiguration();
            config.Routes.MapHttpRoute(
                name: "DefaultApi",
                routeTemplate: "auth/{controller}/{id}",
                defaults: new { controller = "callback", id = RouteParameter.Optional }
            );

            app.UseWebApi(config);
        }
    }

    // API Controller and action called via the redirect_uri registered for thie client_id
    public class callbackController : ApiController
    {
        // GET auth/callback 
        public HttpResponseMessage Get()
        {
            CSharpSDKSamples.AccessCode = Request.RequestUri.ParseQueryString()["code"];

            // state is app-specific string that may be passed around for validation.
            CSharpSDKSamples.StateValue = Request.RequestUri.ParseQueryString()["state"];

            HttpResponseMessage response = new HttpResponseMessage();
            response.Content = new StringContent("Redirect Completed");
            response.StatusCode = HttpStatusCode.OK;

            // Signal the main test that the response has been received.
            CSharpSDKSamples.WaitForCallbackEvent.Set();
            return response;
        }
    }
}