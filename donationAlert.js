(() => {
	const fs = require('fs');		
	const KEYS_FILE_PATH = 'C:\\Users\\Will\\Desktop\\more stuff\\even more stuff\\keys1\\ids.json';
	const MAX_CHARACTERS_IN_UNAME = 50;
	const MAX_DONATION_CHECK = 100;
	const POLL_RATE = 4000;
	const ANIMATIONS_CHECK_RATE = 2000;
	const TRANSITION_TIME = 2000;
	const STALL_TIME = 4500;
	const DONATION_LIMIT = 100; // how many bytes will be read from the front of the transaction file to retrieve the
								// number of records
	const ANONYMOUS = "Anonymous";
	const DEFAULT_NAME = "Name";
	const DEFAULT_MESSAGE = "Message";
	const TRANSACTION_LOG = 'C:\\Users\\Will\\Desktop\\more stuff\\even more stuff\\transactionLog.txt';
			
	// get client id and client secret from local file	
	let keys = JSON.parse(fs.readFileSync(KEYS_FILE_PATH, 'utf-8'));
		
	// get keys from the file
	let username = keys['username'];
	let password = keys['password'];
	let signature = keys['signature'];

	const https = require("https");
	const qs = require("querystring"); 							
					
	// donation alert sound	
	let donationSound = new Audio();
	donationSound.src = "sounds\\YOURE FUCKING A WHITE MALE.mp3";				
	
	// initial start & end query dates
	startDate = (new Date()).toISOString();
	endDate = new Date();

	// donation stack to keep track of animations
	// between calls (synchronous & asynchronous)
	newDonationStack = []; //global scope
					
	// continuously poll the Paypal API for a list of
	// the most recent 100 transactions and check the new donation list
	// against the old donation list
	recentDonationIDs = new Set();
	function checkDonations(){
		 			
		// get end date
		endDate = (new Date()).toISOString();
					
		const params = {
			'user': username,
			'pwd': password,
			'signature': signature,
			'method':'TransactionSearch',
			'version':'78',
			'trxtype':'Q',
			'startdate': startDate,
			'enddate': endDate
		};
	 
		const options = {
			hostname : "api-3t.paypal.com",
			port: 443,
			path: '/nvp/?'+qs.stringify(params),
			method : 'GET'
		}
	 
		// try to get recent transaction ids from the server
		try{
			const req = https.request(options,(res)=>{
					
				let totalBuffer;
					
				res.on("data",(buffer)=>{
					
					totalBuffer += buffer;
					
				})

				res.on("end", ()=>{
					
					// parse response for list of transaction IDs
					let parsedResponse = qs.parse(totalBuffer);					

					let entries = Object.entries(parsedResponse);

					// filter by donations
					let donationIndices = new Set(entries
					.filter(([,s])=>(s.includes("Donation")))
					.map(([v,])=>v.substring(v.length-1)));

					// get transaction IDs
					let newList = entries
					.filter(([x,])=>(x.includes("TRANSACTIONID")
									 && donationIndices.has(x.substring(x.length-1))))
					.map(([,v])=>v);
					
					// compare the new list to the old list
					// and find any differences
					let count = 0;
					while(count < newList.length && count < MAX_DONATION_CHECK){
						let newID = newList[count];
						if(!recentDonationIDs.has(newID)){
							
							recentDonationIDs.add(newID);
							
							// get more transation details from
							// Paypal and in the callback push
							// those details as a new donation object
							// to the donation stack
							try{
								pushTransactionDetails(newDonationStack, newID);
							} catch(e){
								console.log("Failure - Donation information could not be pushed.");
							}
						}													
						++count;
					}															
					
					// makes a request to the paypal api for information
					// using a transaction id and then places the donation object
					// on the donation stack
					function pushTransactionDetails(stack, id){
								
						const params = {
							'user': username,
							'pwd': password,
							'signature': signature,
							'method':'GetTransactionDetails',
							'version':'78',
							'trxtype':'Q',
							'transactionid': id
						};
						
						const options = {
							hostname : "api-3t.paypal.com",
							port: 443,
							path: '/nvp?'+qs.stringify(params),
							method : 'GET'
						};

						// try getting transaction details from the server
						try{
							const req = https.request(options,(res)=>{
								
								let totalBuffer = '';			
									
								res.on("data",(buffer)=>{
									
									totalBuffer += buffer;
									
								});

								res.on("end", ()=>{
													
									let parsedResponse = qs.parse(totalBuffer);	

									// get relevant transaction information
									let donation = new Object();						
									
									// ensure that the parsed response has a 'custom'
									// value before reading it							
									let temp = "";
									donation.name = ANONYMOUS;
									donation.message = "";
									if('CUSTOM' in parsedResponse){
										temp = parsedResponse['CUSTOM'];	
									
										// get name and message from temp
										donation.name = temp.substr(0, MAX_CHARACTERS_IN_UNAME).trim();
										donation.message = temp.substr(MAX_CHARACTERS_IN_UNAME);
										
										// user intended anonymous but our program converted it
										if(donation.name == DEFAULT_NAME &&
											donation.message == DEFAULT_MESSAGE){
												donation.name = ANONYMOUS;
												donation.message = "";
										}
										if(donation.name == ""){
											donation.name = ANONYMOUS;
										}
															
									}
									donation.amount = -0.01;	
									
									// get the amount
									try{
										donation.amount = parsedResponse['AMT'];	
									} catch(e){
										console.log("ERROR - Amount could not be read.");
									}

									function writeDonationToFile(donation, parsedResponse){

										// read the first integer of the transaction log and increment it
										// by one
										if(fs.existsSync(TRANSACTION_LOG)){
												let stats = fs.statSync(TRANSACTION_LOG);
												let fd = fs.openSync(TRANSACTION_LOG, "r+");
												let bufferSize = (stats.size < DONATION_LIMIT) ? stats.size : DONATION_LIMIT;
												let buffer = new Buffer(bufferSize);
												fs.readSync(fd, buffer, 0, buffer.length, 0);
												let data = buffer.toString("utf8", 0, buffer.length).split('\r\n')[0];										
												let donationCount = parseInt(data, 10);
												donationCount+=1;
												let newBuffer = Buffer.from(donationCount.toString(10)+"\r\n");
												fs.writeSync(fd, newBuffer, 0, newBuffer.length, 0);
																
												// generate a formatted string based on the donation object
												donationAsString = "" + donationCount + "\r\n";
												let keys = Object.keys(donation)
												for( x in keys){
													donationAsString += keys[x]+": "+donation[keys[x]]+"\r\n";
												}
												
												// generate a formatted string based on the Paypal message
												keys = Object.keys(parsedResponse)
												for( x in keys){
													donationAsString += keys[x]+": "+parsedResponse[keys[x]]+"\r\n";
												}

												donationAsString+='-'.repeat(50);
												donationAsString+="\r\n\r\n";

												newBuffer = Buffer.from(donationAsString);

												// next, write the donation object to the file
												fs.writeSync(fd, newBuffer, 0, newBuffer.length, stats.size);
												
												fs.closeSync(fd);
										}
									}							

									writeDonationToFile(donation, parsedResponse);

									stack.push(donation);
									
									totalBuffer = '';
								});
								
							});
							
							req.end();

						} catch(e){
							console.log("ERROR - Could not reach Paypal server.");
						}
					}		
					
					totalBuffer = "";
				});
							
			}).on('error', (e) => {
				console.error(e);
			});
			
			req.end();

		}catch(e){
			console.log("ERROR - Could not reach paypal server.");
		}
		
				
	}
		
	// pop and a single donation from the stack display it
	notAnimating = true; // global scoped variable
	function handleAnimations(){

		if(newDonationStack.length && notAnimating){

			// lock animation resources
			notAnimating = false;
		
			// set the donation alert name
			let theDonation = newDonationStack.pop();
			let theText = document.getElementById('donationText');
			theText.textContent = theDonation.name+" donated $"+theDonation.amount
			+"\n"+theDonation.message;		

			// transition the donation alert into view
			let theDonationAlert = document.getElementById('donationAlert');
			donationAlert.classList.add('isVisible');
			
			// play the current alert sound
			donationSound.setTime = 0.00;
			donationSound.play();
												
			// transition the donation alert out of view
			setTimeout(transitionAlert, TRANSITION_TIME+STALL_TIME);
			
			function transitionAlert(){
				
				// begin animation to remove the follower alert
				donationAlert.classList.remove('isVisible');

				// unlock animation resources after animation ends											
				setTimeout(() => {notAnimating = true;}, TRANSITION_TIME);
				
			}
			
		}		
		
	}

	setInterval(checkDonations, POLL_RATE);
	setInterval(handleAnimations, ANIMATIONS_CHECK_RATE);	

})()