import { Buffer } from 'node:buffer'; // Imported like this for Cloudflare compatibility
/**
 * Represents a transactional email that is sent to a user.
 */
export interface TransactionalEmail {
	id: number;
	recipientEmail: string;
	variables: Record<string, string>;
	/**
	 * When sending this email template, the recipient will be subscribed to these lists
	 */
	associatedLists?: number[];
}

/**
 * Represents an email that is sent to admins for analytics purposes.
 */
export interface AnalyticsEmail {
	id: number;
	recipientEmail: string;
	variables: Record<string, string>;
}

export default class ListmonkClient {
	apiUrl: string;
	authHeader: string;
	constructor(apiUrl: string, username: string, password: string) {
		this.apiUrl = apiUrl;
		this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
	}

	deleteSubscriber = async (email: string) => {
		console.log(`Deleting subscriber for ${email}`);
		const getSubscriberResponse = await fetch(
			`${this.apiUrl}/subscribers?query=${encodeURIComponent(`subscribers.email = '${email}'`)}`,
			{
				headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' }
			}
		);
		if (!getSubscriberResponse.ok) {
			console.error(
				`Could not get subscriber for email ${email}. Got status ${getSubscriberResponse.status} from Listmonk. Message: ${await getSubscriberResponse.text()}`
			);
			return;
		}
		const subscribers = (await getSubscriberResponse.json()).data.results as { id: string }[];
		if (subscribers.length < 1) {
			console.warn(`No subscribers found for email ${email}`);
			return;
		}
		if (subscribers.length > 1) {
			// Listmonk treats subscriber emails as unique, so this should never happen. But just in case.
			throw new Error(`Found ${subscribers.length} subscribers for email ${email}. Expected 1.`);
		}
		const deleteSubscriberResponse = await fetch(`${this.apiUrl}/subscribers/${subscribers[0].id}`, {
			method: 'DELETE',
			headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' }
		});
		if (!deleteSubscriberResponse.ok) {
			console.error(
				`Could not delete subscriber. Got status ${deleteSubscriberResponse.status} from Listmonk. Message: ${await deleteSubscriberResponse.text()}`
			);
		} else {
			console.log(`Deleted subscriber ${subscribers[0].id}`);
		}
	};

	addSubscriber = async (email: string, name: string, status = 'enabled', lists: number[] = []) => {
		console.log(`Creating subscriber for ${email}`);
		const createSubscriberResponse = await fetch(`${this.apiUrl}/subscribers`, {
			method: 'POST',
			headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				email,
				status,
				lists
			})
		});
		if (createSubscriberResponse.status === 409 && lists.length > 0) {
			console.log('Subscriber already exists. Adding lists.');
			const listUuids = (
				await Promise.all(
					lists.map(async (listId) => {
						const listResponse = await fetch(`${this.apiUrl}/lists/${listId}`, {
							headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' }
						});
						if (!listResponse.ok) {
							console.error(
								`Could not get list UUID for list ${listId}. Got status ${listResponse.status} from Listmonk. Message: ${await listResponse.text()}`
							);
							return null;
						}
						const listJson = await listResponse.json();
						return listJson.data.uuid;
					})
				)
			).filter((uuid) => uuid !== null);
			const listResponse = await fetch(`${this.apiUrl}/public/subscription`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					list_uuids: listUuids
				})
			});
			if (listResponse.status !== 200) {
				console.error(
					`Could not add subscriber to lists. Got status ${listResponse.status} from Listmonk. Message: ${await listResponse.text()}`
				);
			} else {
				console.log(`Added user to lists ${lists}`);
			}
			return;
		}
		if (createSubscriberResponse.status !== 200) {
			throw new Error(`Error creating subscriber. Got status ${createSubscriberResponse.status} from Listmonk.
      Status text: ${createSubscriberResponse.statusText}.
      Body: ${await createSubscriberResponse.text()}`);
		}
		console.log(`Status code from Listmonk for user creation: ${createSubscriberResponse.status}`);
	};

	removeSubscribers = async (email: string, lists: number[] = []) => {
		console.log(`Unsubscribing ${email} from lists ${lists}`);
		const getSubscriberResponse = await fetch(
			`${this.apiUrl}/subscribers?query=${encodeURIComponent(`subscribers.email = '${email}'`)}`,
			{
				headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' }
			}
		);
		if (!getSubscriberResponse.ok) {
			console.error(
				`Could not get subscriber for email ${email}. Got status ${getSubscriberResponse.status} from Listmonk. Message: ${await getSubscriberResponse.text()}`
			);
			return;
		}
		const subscribers = (await getSubscriberResponse.json()).data.results as { id: string }[];
		if (subscribers.length !== 1) {
			console.warn(`Found ${subscribers.length} subscribers for email ${email}. Expected 1.`);
			if (!subscribers.length) return;
		}
		const removeListsResponse = await fetch(`${this.apiUrl}/subscribers/lists`, {
			method: 'PUT',
			headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				ids: subscribers.map((subscriber) => subscriber.id),
				action: 'remove',
				target_list_ids: lists
			})
		});
		if (!removeListsResponse.ok) {
			console.error(
				`Could not remove subscriber from lists. Got status ${removeListsResponse.status} from Listmonk. Message: ${await removeListsResponse.text()}`
			);
		} else {
			console.log(`Removed user(s) ${subscribers.map(({ id }) => id)} from lists ${lists}`);
		}
	};

	/**
	 * Sends a transactional email to a customer.
	 * @param email
	 * @param options
	 */
	sendTransactionalEmail = async (email: TransactionalEmail, options?: { userDisplayName?: string }) => {
		await this.addSubscriber(
			email.recipientEmail,
			options?.userDisplayName || 'Anonymous',
			'enabled',
			email.associatedLists
		);
		console.log(`Sending ${email.constructor.name} email to ${email.recipientEmail}`);
		const emailBody = JSON.stringify({
			subscriber_email: email.recipientEmail,
			template_id: email.id,
			data: email.variables
		});
		const response = await fetch(`${this.apiUrl}/tx`, {
			method: 'POST',
			headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
			body: emailBody
		});
		if (response.status !== 200) {
			throw new Error(`Got status ${response.status} from Listmonk.
        Status text: ${response.statusText}.
        Body: ${await response.text()}`);
		}
		console.log(`Status code from Listmonk for email send: ${response.status}`);
	};

	/**
	 * Sends an email to admins for analytics purposes.
	 * @param email
	 */
	sendAnalyticsEmail = async (email: AnalyticsEmail) => {
		console.log(`Sending ${email.constructor.name} email to ${email.recipientEmail}`);
		const emailBody = JSON.stringify({
			subscriber_email: email.recipientEmail,
			template_id: email.id,
			data: email.variables
		});
		const response = await fetch(`${this.apiUrl}/tx`, {
			method: 'POST',
			headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
			body: emailBody
		});
		if (response.status !== 200) {
			throw new Error(`Got status ${response.status} from Listmonk.
				Status text: ${response.statusText}.
				Body: ${await response.text()}`);
		}
		console.log(`Status code from Listmonk for email send: ${response.status}`);
	};
}
