define([
    'jquery',
], function($) {
	var rest = {
		getCurrentSellOrders: function(assetType){
			return new Promise(function(res,rej) {
				$.get("/getCurrentSellOrder",function(data,status){
					if(status == "success"){
						res(data)	
					} else{
						rej(data)
					}
					
				})
			})
		},
		getCurrentBuyOrders: function(assetType){
			return new Promise(function(res,rej) {
				$.get("/getCurrentBuyOrder",function(data,status){
					if(status == "success"){
						res(data)	
					} else{
						rej(data)
					}
					
				})
			})
		}
	}
	return rest;
})